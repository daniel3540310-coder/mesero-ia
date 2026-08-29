import { useCallback, useEffect, useRef, useState } from "react";

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Una nota con envolvente, para que suene a campana y no a zumbido. */
function playTone(ctx: AudioContext, frequency: number, startAt: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

/**
 * Campana de comanda nueva.
 *
 * Se sintetiza con la Web Audio API en vez de reproducir un MP3: no hay archivo
 * que descargar (la cocina puede tener mala conexión) y el sonido es siempre el
 * mismo.
 *
 * Los navegadores bloquean el audio hasta que alguien interactúa con la página,
 * así que `ready` indica si el sonido ya está habilitado y `enable` debe
 * llamarse desde un clic real del usuario.
 */
export function useKitchenAlert() {
  const contextRef = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);

  const supported = getAudioContextConstructor() !== null;

  const enable = useCallback(async () => {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return;

    if (!contextRef.current) contextRef.current = new Ctor();
    // resume() solo surte efecto dentro de un gesto del usuario; por eso este
    // hook expone `enable` en vez de intentar arrancar el audio solo.
    await contextRef.current.resume().catch(() => undefined);
    setReady(contextRef.current.state === "running");
  }, []);

  const play = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx || ctx.state !== "running") return;

    // Dos notas ascendentes: se distingue del ruido de una cocina.
    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.18);
    playTone(ctx, 1320, now + 0.16, 0.32);
  }, []);

  useEffect(() => {
    return () => {
      contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    };
  }, []);

  return { supported, ready, enable, play };
}
