import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecognitionOptions {
  /** Idioma del dictado. Por defecto español de México. */
  lang?: string;
  /**
   * Se llama cada vez que hay texto reconocido. `interim` es el texto
   * provisional que el navegador aún puede corregir mientras el cliente habla.
   */
  onResult: (final: string, interim: string) => void;
}

const ERROR_MESSAGES: Record<SpeechRecognitionErrorCode, string> = {
  "not-allowed": "Necesitamos permiso para usar el micrófono.",
  "service-not-allowed": "Necesitamos permiso para usar el micrófono.",
  "no-speech": "No escuchamos nada. Intenta de nuevo.",
  "audio-capture": "No encontramos un micrófono disponible.",
  network: "No se pudo conectar el reconocimiento de voz.",
  "language-not-supported": "El dictado no está disponible en este idioma.",
  "bad-grammar": "No se pudo procesar el audio.",
  aborted: "",
};

/**
 * Dictado por voz con la Web Speech API nativa del navegador.
 *
 * Requiere un contexto seguro (HTTPS o localhost) y no existe en todos los
 * navegadores — `supported` indica si se puede ofrecer la función.
 */
export function useSpeechRecognition({ lang = "es-MX", onResult }: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // onResult suele ser una función nueva en cada render. Se guarda en un ref
  // para que `start` no dependa de ella: recrear el objeto SpeechRecognition
  // a media dictado cortaría el micrófono.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const start = useCallback(() => {
    if (recognitionRef.current) return; // ya está escuchando

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      onResultRef.current(final, interim);
    };

    recognition.onerror = (event) => {
      // "aborted" es lo que ocurre al cancelar a propósito: no es un fallo.
      const message = ERROR_MESSAGES[event.error];
      if (message) setError(message);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    setError(null);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Si el cliente cierra o cambia de pantalla mientras dicta, soltar el micrófono.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, error, start, stop };
}
