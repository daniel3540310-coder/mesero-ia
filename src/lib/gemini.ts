import { supabase } from "./supabaseClient";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  reply: string;
  productIds: string[];
}

export async function askRestaurantAssistant(
  qrToken: string,
  message: string,
  history: ChatMessage[]
): Promise<AssistantReply> {
  const { data, error } = await supabase.functions.invoke("gemini-chat", {
    body: { qrToken, message, history },
  });

  if (error) {
    // FunctionsHttpError trae siempre el mismo mensaje genérico
    // ("Edge Function returned a non-2xx status code"); el motivo real
    // viene en el body de la respuesta, en error.context.
    const context = (error as { context?: Response }).context;
    const detail = await context?.clone().json().then(
      (body: { error?: string }) => body.error,
      () => undefined
    );
    throw new Error(detail ?? error.message ?? "No se pudo contactar al asistente.");
  }

  return { reply: data.reply as string, productIds: (data.productIds as string[]) ?? [] };
}
