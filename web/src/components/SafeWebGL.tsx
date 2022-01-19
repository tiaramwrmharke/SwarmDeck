import { Component, Fragment, type ReactNode } from 'react';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

export default class SafeWebGL extends Component<
  { children: ReactNode; fallback?: ReactNode },
