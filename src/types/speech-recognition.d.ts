// Web Speech API (reconocimiento de voz).
//
// lib.dom.d.ts de TypeScript ya declara SpeechRecognitionAlternative,
// SpeechRecognitionResult y SpeechRecognitionResultList, pero NO la interfaz
// SpeechRecognition ni sus eventos, así que aquí se declara solo lo que falta
// (redeclarar las existentes causaría un conflicto de tipos).
//
// A propósito NO se declara `var SpeechRecognition` global: la API no existe en
// todos los navegadores (Firefox no la soporta), así que el único acceso
// permitido es vía `window.SpeechRecognition ?? window.webkitSpeechRecognition`,
// que obliga a comprobar soporte antes de usarla.

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

type SpeechRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
