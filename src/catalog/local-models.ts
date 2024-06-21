export interface LocalModelEntry {
  id: string;
  name: string;
  publisher: string;
  paramsB: number;
  sizeGb: number;
  minRamGb: number;
  description: string;
  descriptionZh: string;
  ollamaTag?: string;
  mlxModel?: string;
  homepage?: string;
}

export const LOCAL_MODELS: LocalModelEntry[] = [
  {
    id: 'qwen2.5-coder-7b',
    name: 'Qwen2.5-Coder 7B',
    publisher: 'Alibaba Qwen',
    paramsB: 7,
    sizeGb: 5,
    minRamGb: 16,
    description: 'Compact coding-tuned model; a strong 16 GB Mac default for agent loops.',
    descriptionZh: '面向代码的小模型，16GB Mac 上跑 agent 的稳健选择。',
    ollamaTag: 'qwen2.5-coder:7b',
    mlxModel: 'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit',
    homepage: 'https://qwenlm.github.io/blog/qwen2.5-coder/',
  },
  {
    id: 'llama-3.3-8b',
    name: 'Llama 3.3 8B Instruct',
    publisher: 'Meta',
    paramsB: 8,
    sizeGb: 5,
    minRamGb: 16,
    description: 'General-purpose chat; competent tool use, weaker on long-form code edits.',
    descriptionZh: '通用对话模型，工具调用合格，长代码改写偏弱。',
    ollamaTag: 'llama3.3:8b',
