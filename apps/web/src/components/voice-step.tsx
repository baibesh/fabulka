"use client";

import { useQueryClient } from "@tanstack/react-query";
import { VOICE_DISABLED, VOICE_RATE_LIMITED, type Template, type VoicePrefill } from "@fabulka/shared";
import { Mic, ShieldCheck, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClientValue } from "@/hooks/use-hydrated";
import { ApiError, transcribeVoice } from "@/lib/api";
import { canRecord, startRecording, type Recorder } from "@/lib/recorder";
import { encodeWav, recordingToWav, VOICE_SAMPLE_RATE } from "@/lib/wav";
import { useI18n } from "@/i18n/i18n";
import type { MessageKey } from "@/i18n/messages";
import { Spinner } from "./ui/spinner";

/** The API takes at most a minute. */
const MAX_SECONDS = 60;
/** Shorter than this is a tap by mistake, not a story. */
const MIN_SECONDS = 1.5;

type State =
  | { kind: "idle" }
  | { kind: "recording"; left: number }
  | { kind: "sending" }
  | { kind: "problem"; message: MessageKey };

/**
 * The parent tells about the child aloud; the recording is recognised and the fields it named come
 * back to fill in the form. Audio lives in memory only until it is sent.
 */
export function VoiceStep({
  template,
  onPrefill,
  onSkip,
}: {
  template?: Template;
  onPrefill: (prefill: VoicePrefill) => void;
  onSkip: () => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ kind: "idle" });
  const recorder = useRef<Recorder | null>(null);
  const startedAt = useRef(0);
  // ?voiceTest=1 offers a silent recording, for end-to-end tests that have no microphone.
  const testHook = useClientValue(() => new URLSearchParams(window.location.search).get("voiceTest") === "1", false);

  // Leaving the step mid-recording releases the microphone.
  useEffect(() => () => recorder.current?.cancel(), []);

  const send = async (wav: ArrayBuffer) => {
    setState({ kind: "sending" });
    try {
      const prefill = await transcribeVoice(new Blob([wav], { type: "audio/wav" }), locale, template?.slug);
      if (!prefill.transcript.trim()) return setState({ kind: "problem", message: "voice.empty" });
      setState({ kind: "idle" });
      onPrefill(prefill);
    } catch (error) {
      if (error instanceof ApiError && error.code === VOICE_DISABLED) void queryClient.invalidateQueries({ queryKey: ["status"] });
      const limited = error instanceof ApiError && error.code === VOICE_RATE_LIMITED;
      setState({ kind: "problem", message: limited ? "voice.error.limit" : "voice.error.failed" });
    }
  };

  const stop = async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    const seconds = (Date.now() - startedAt.current) / 1000;
    setState({ kind: "sending" });
    const recording = await active.stop();
    if (seconds < MIN_SECONDS) return setState({ kind: "problem", message: "voice.error.short" });
    await send(recordingToWav(recording.chunks, recording.sampleRate, MAX_SECONDS));
  };

  const start = async () => {
    if (!canRecord()) return setState({ kind: "problem", message: "voice.error.unsupported" });
    try {
      recorder.current = await startRecording();
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      return setState({ kind: "problem", message: denied ? "voice.error.denied" : "voice.error.unsupported" });
    }
    startedAt.current = Date.now();
    setState({ kind: "recording", left: MAX_SECONDS });
  };

  // The countdown; at zero the recording is sent as it is.
  const recording = state.kind === "recording";
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const left = Math.max(0, MAX_SECONDS - Math.floor((Date.now() - startedAt.current) / 1000));
      if (left === 0) void stop();
      else setState({ kind: "recording", left });
    }, 250);
    return () => clearInterval(timer);
    // `stop` reads refs only; restarting the timer on every render would reset nothing useful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const questions = template?.questions.map((q) => q.label).join("; ");

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <p className="text-muted">{t("voice.lead")}</p>
      {questions && <p className="text-sm text-muted">{t("voice.lead.questions", { questions })}</p>}

      {state.kind === "recording" ? (
        <button
          type="button"
          data-testid="voice-stop"
          onClick={() => void stop()}
          aria-label={t("voice.stop")}
          className="flex size-28 animate-pulse items-center justify-center rounded-full bg-danger text-white shadow-lg"
        >
          <Square className="size-10 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          data-testid="voice-start"
          onClick={() => void start()}
          disabled={state.kind === "sending"}
          aria-label={t("voice.start")}
          className="flex size-28 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg disabled:opacity-60"
        >
          {state.kind === "sending" ? <Spinner size="lg" /> : <Mic className="size-12" />}
        </button>
      )}

      <p data-testid="voice-status" role="status" aria-live="polite" className="min-h-6 font-semibold">
        {state.kind === "idle" && t("voice.start")}
        {state.kind === "recording" && t("voice.recording", { seconds: state.left })}
        {state.kind === "sending" && t("voice.sending")}
        {state.kind === "problem" && <span className="text-danger">{t(state.message)}</span>}
      </p>

      <p className="flex items-center gap-2 text-sm text-muted">
        <ShieldCheck className="size-4 shrink-0 text-accent" />
        {t("voice.privacy")}
      </p>
      {locale === "kk" && <p className="text-sm text-muted">{t("voice.kkHint")}</p>}

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button type="button" data-testid="voice-manual" onClick={onSkip} className="font-semibold text-accent">
          {t("voice.manual")} →
        </button>
        {testHook && (
          <button
            type="button"
            data-testid="voice-sample"
            disabled={state.kind === "sending" || state.kind === "recording"}
            onClick={() => void send(encodeWav(new Float32Array(2 * VOICE_SAMPLE_RATE), VOICE_SAMPLE_RATE))}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted"
          >
            {t("voice.sample")}
          </button>
        )}
      </div>
    </div>
  );
}
