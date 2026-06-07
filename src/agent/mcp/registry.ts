export type McpTransportSpec =
  | { type: 'stdio'; command: string; args: string[] }
  | { type: 'http'; url: string };

export interface CredentialField {
  key: string;
  label: string;
  labelZh: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  helpUrl?: string;
}

export type McpAuthSpec =
  | { type: 'none' }
  | { type: 'credentials'; fields: CredentialField[] }
  | {
      type: 'mcp-oauth';
      authorizationEndpoint?: string;
      tokenEndpoint?: string;
      registrationEndpoint?: string;
      clientId?: string;
      scopes?: string[];
    };

export type McpCategory = 'dev' | 'productivity' | 'communication' | 'data' | 'search' | 'utility';

export type RecommendedScope = 'global' | 'workspace' | 'both';

export interface RecommendedMcpServer {
  id: string;
