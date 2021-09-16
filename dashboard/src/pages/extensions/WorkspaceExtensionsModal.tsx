import { useStore } from '../../store';
import { Modal, ModalHeader } from '../../components/ui';
import { WorkspaceExtensionsBody } from './ExtensionsTab';

function L(locale: string, zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

export function WorkspaceExtensionsModal({
  open,
  onClose,
  workdir,
}: {
  open: boolean;
