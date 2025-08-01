import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { z } from 'zod';
import { checkFileSize } from './file-utils';
import { FILE_SIZE_LIMITS } from './constants';

export const DESCRIPTION =
  'Make multiple edits to a single file in one operation';

const editSchema = z.object({
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace all occurrences (default: false)'),
});

export const multiEditParamsSchema = z.object({
  file_path: z.string().describe('Relative file path'),
  edits: z.array(editSchema).min(1).describe('Array of edit objects'),
});

export type MultiEditParams = z.infer<typeof multiEditParamsSchema>;

const toolResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  editsApplied: z.number().optional(),
  error: z.string().optional(),
});

type ToolResult = z.infer<typeof toolResultSchema>;

/**
 * MultiEdit tool for making multiple edits to a single file
 * - Applies multiple find-and-replace operations efficiently
 * - Each edit can replace a single occurrence or all occurrences
 * - Edits are applied sequentially in the order provided
 * - More efficient than multiple single-edit operations
 */
export async function multiEditTool(
  params: MultiEditParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { file_path, edits } = params;

  // Validate required parameters
  if (!file_path) {
    return {
      success: false,
      message: 'Missing required parameter: file_path',
      error: 'MISSING_FILE_PATH',
    };
  }

  if (!edits || edits.length === 0) {
    return {
      success: false,
      message:
        'Missing required parameter: edits (must contain at least one edit)',
      error: 'MISSING_EDITS',
    };
  }

  // Validate each edit
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (!edit) {
      return {
        success: false,
        message: `Edit at index ${i} is undefined`,
        error: 'INVALID_EDIT',
      };
    }
    if (!edit.old_string) {
      return {
        success: false,
        message: `Edit at index ${i} missing required field: old_string`,
        error: 'INVALID_EDIT',
      };
    }
    if (edit.new_string === undefined) {
      return {
        success: false,
        message: `Edit at index ${i} missing required field: new_string`,
        error: 'INVALID_EDIT',
      };
    }
    if (edit.old_string === edit.new_string) {
      return {
        success: false,
        message: `Edit at index ${i} has identical old_string and new_string`,
        error: 'INVALID_EDIT',
      };
    }
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(file_path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      return {
        success: false,
        message: `File does not exist: ${file_path}`,
        error: 'FILE_NOT_FOUND',
      };
    }

    // Check file size before reading
    const sizeCheck = await checkFileSize(
      clientRuntime,
      absolutePath,
      FILE_SIZE_LIMITS.EDIT_MAX_FILE_SIZE,
    );

    if (!sizeCheck.isWithinLimit) {
      return {
        success: false,
        message: sizeCheck.error || `File is too large to edit: ${file_path}`,
        error: 'FILE_TOO_LARGE',
      };
    }

    // Log file size if available
    if (sizeCheck.fileSize !== undefined) {
      console.log(
        `[multiEditTool] Editing file ${file_path} (${sizeCheck.fileSize} bytes)`,
      );
    }

    // Read the current file content
    const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
    if (!readResult.success || !readResult.content) {
      return {
        success: false,
        message: `Failed to read file: ${file_path}`,
        error: readResult.error || 'READ_ERROR',
      };
    }

    let content = readResult.content;
    let totalEditsApplied = 0;

    // Apply each edit sequentially
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit) continue; // Skip if edit is undefined (should not happen after validation)

      const { old_string, new_string, replace_all = false } = edit;

      // Count occurrences before replacement
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        console.log(
          `[multiEditTool] Edit ${i}: No occurrences of "${old_string}" found`,
        );
        continue;
      }

      // Apply the replacement
      if (replace_all) {
        // Replace all occurrences
        content = content.split(old_string).join(new_string);
        totalEditsApplied += occurrences;
        console.log(
          `[multiEditTool] Edit ${i}: Replaced ${occurrences} occurrences`,
        );
      } else {
        // Replace only the first occurrence
        const index = content.indexOf(old_string);
        if (index !== -1) {
          content =
            content.substring(0, index) +
            new_string +
            content.substring(index + old_string.length);
          totalEditsApplied += 1;
          console.log(`[multiEditTool] Edit ${i}: Replaced 1 occurrence`);
        }
      }
    }

    // Write the modified content back to the file
    if (totalEditsApplied > 0) {
      const writeResult = await clientRuntime.fileSystem.writeFile(
        absolutePath,
        content,
      );
      if (!writeResult.success) {
        return {
          success: false,
          message: `Failed to write file: ${file_path}`,
          error: writeResult.error || 'WRITE_ERROR',
        };
      }
    }

    return {
      success: true,
      message: `Successfully applied ${totalEditsApplied} edits to ${file_path}`,
      editsApplied: totalEditsApplied,
    };
  } catch (error) {
    return {
      success: false,
      message: `MultiEdit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
