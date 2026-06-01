import { cn } from '../../utils';
import { formatFileSize } from './utils';

export function FileChip({
  url,
  fileName,
  fileSize,
  caption,
}: {
  url: string;
