import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Button, Input, Modal, ModalHeader, Spinner } from '../../components/ui';
import { cn } from '../../utils';
import type { InteractionSnapshot } from '../../types';

interface Props {
  snapshot: InteractionSnapshot;
}

export function InteractionPromptModal({ snapshot }: Props) {
  const [currentIndex, setCurrentIndex] = useState(snapshot.currentIndex ?? 0);
  const [freeformText, setFreeformText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentIndex(snapshot.currentIndex ?? 0);
    setFreeformText('');
    setError(null);
  }, [snapshot.promptId, snapshot.currentIndex]);

  const questions = snapshot.questions || [];
  const question = questions[currentIndex] || null;
  const totalQuestions = questions.length;

  const hasOptions = !!(question?.options && question.options.length);
  const allowFreeform = hasOptions ? !!question?.allowFreeform : true;

  const advanceOrFinish = (advanced: boolean | undefined) => {
    if (advanced) {
      setCurrentIndex(idx => idx + 1);
      setFreeformText('');
    }
  };

  const handleSelectOption = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.interactionSelectOption(snapshot.promptId, value);
      if (!res.ok) { setError(res.error || 'Failed to submit selection.'); return; }
