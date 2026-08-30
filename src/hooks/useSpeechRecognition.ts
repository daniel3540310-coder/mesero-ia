import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecognitionOptions {
  /** Idioma del dictado. Por defecto español de México. */
  lang?: string;
  /**
   * Modo manos libres: el micrófono se vuelve a abrir solo cuando el navegador
   * lo cierra por silencio. Pensado para la cocina, donde nadie puede tocar la
   * pantalla. En false (por defecto) se comporta como un dictado puntual.
   */
  continuous?: boolean;
  /**
   * Se llama cada vez que hay texto reconocido. `interim` es el texto
   * provisional que el navegador aún puede corregir mientras se habla.
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

/** Errores por los que no tiene sentido reintentar: reabrir el micrófono fallaría igual. */
const FATAL_ERRORS: SpeechRecognitionErrorCode[] = [
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
];

/**
 * Chrome cierra la sesión de reconocimiento cada pocos segundos de silencio.
 * Reabrirla en el acto falla —la anterior aún no se libera— así que se espera
 * un momento antes de volver a arrancar.
 */
const RESTART_DELAY_MS = 300;

/** Si ni así se logra reabrir, se avisa en vez de quedar reintentando en vano. */
const MAX_RESTART_FAILURES = 5;

/**
 * Reconocimiento de voz con la Web Speech API nativa del navegador.
 *
 * Requiere un contexto seguro (HTTPS o localhost) y no existe en todos los
 * navegadores — `supported` indica si se puede ofrecer la función.
 */
export function useSpeechRecognition({
  lang = "es-MX",
  continuous = false,
  onResult,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // En modo continuo el navegador cierra el micrófono solo (por silencio o por
  // límite de tiempo). Este ref distingue ese cierre automático —hay que
  // reabrirlo— de una parada pedida por el usuario.
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const failuresRef = useRef(0);

  // onResult suele ser una función nueva en cada render. Se guarda en un ref
  // para que `open` no dependa de ella: recrear el objeto SpeechRecognition
  // a media escucha cortaría el micrófono.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  // `open` se guarda en un ref para que el reinicio programado pueda llamarlo
  // sin crear una dependencia circular entre los dos callbacks.
  const openRef = useRef<() => void>(() => {});

  const clearRestart = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestart = useCallback(
    (delay: number = RESTART_DELAY_MS) => {
      if (!shouldListenRef.current) return;
      clearRestart();
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        openRef.current();
      }, delay);
    },
    [clearRestart]
  );

  const open = useCallback(() => {
    if (recognitionRef.current) return; // ya está escuchando

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
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
      if (FATAL_ERRORS.includes(event.error)) {
        // Reabrir no serviría de nada: se corta la escucha del todo.
        shouldListenRef.current = false;
        clearRestart();
        setError(ERROR_MESSAGES[event.error]);
        return;
      }
      // En manos libres el silencio es normal (la cocina no habla todo el rato):
      // no se muestra como error, el micrófono simplemente se reabre en onend.
      if (continuous && (event.error === "no-speech" || event.error === "network")) return;
      const message = ERROR_MESSAGES[event.error];
      if (message) setError(message);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldListenRef.current) {
        // Nunca reabrir aquí de forma síncrona: la sesión que acaba de cerrarse
        // sigue ocupando el micrófono y start() lanzaría InvalidStateError.
        scheduleRestart();
        return;
      }
      setListening(false);
    };

    setError(null);
    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
      failuresRef.current = 0;
    } catch {
      // Si start() falla hay que soltar el ref: dejarlo apuntando a un
      // reconocimiento que nunca arrancó bloquearía el guard de arriba en todos
      // los intentos siguientes, y el micrófono quedaría muerto para siempre
      // mientras el botón sigue diciendo "Escuchando…".
      recognitionRef.current = null;
      failuresRef.current += 1;

      if (failuresRef.current > MAX_RESTART_FAILURES) {
        shouldListenRef.current = false;
        setListening(false);
        setError("No se pudo mantener el micrófono abierto. Vuelve a activarlo.");
        return;
      }
      // Espera creciente: si el micrófono está ocupado, insistir más rápido no ayuda.
      scheduleRestart(RESTART_DELAY_MS * failuresRef.current);
    }
  }, [lang, continuous, clearRestart, scheduleRestart]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const start = useCallback(() => {
    shouldListenRef.current = true;
    failuresRef.current = 0;
    open();
  }, [open]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearRestart();
    recognitionRef.current?.stop();
  }, [clearRestart]);

  // Si se cierra la pantalla mientras escucha, soltar el micrófono.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current !== null) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, error, start, stop };
}
