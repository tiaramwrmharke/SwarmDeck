export interface HumanLoopOption {
  label: string;
  description?: string | null;
  value: string;
}

export interface HumanLoopQuestion {
  id: string;
  header: string;
  prompt: string;
  options?: HumanLoopOption[] | null;
  allowFreeform?: boolean;
  secret?: boolean;
  allowEmpty?: boolean;
}

export interface HumanLoopAnswerState {
  selectedValue: string | null;
  freeformText: string | null;
  awaitingFreeform: boolean;
  skipped: boolean;
}

export interface HumanLoopAnswerSummary {
  values: string[];
  display: string;
}

export interface HumanLoopPromptState<ChatId = number | string> {
  promptId: string;
  taskId: string;
  chatId: ChatId;
  title: string;
  detail?: string | null;
  hint?: string | null;
  questions: HumanLoopQuestion[];
  currentIndex: number;
  answers: Record<string, HumanLoopAnswerState>;
  resolveWith: (answers: Record<string, string[]>) => Record<string, any> | null;
  resolve: (response: Record<string, any> | null) => void;
  reject: (error: Error) => void;
  messageIds: Array<number | string>;
  silent?: boolean;
}

export function createEmptyHumanLoopAnswer(): HumanLoopAnswerState {
  return {
    selectedValue: null,
    freeformText: null,
    awaitingFreeform: false,
    skipped: false,
  };
}

export function currentHumanLoopQuestion(prompt: HumanLoopPromptState): HumanLoopQuestion | null {
  return prompt.questions[prompt.currentIndex] || null;
}

export function isHumanLoopQuestionAnswered(prompt: HumanLoopPromptState, questionIndex: number): boolean {
