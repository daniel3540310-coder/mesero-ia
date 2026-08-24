import { supabase } from "./supabaseClient";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProposedOrderItem {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface AssistantReply {
  reply: string;
  productIds: string[];
  orderItems: ProposedOrderItem[];
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
    const body = await context?.clone().json().then(
      (parsed: { error?: string; detail?: string }) => parsed,
      () => undefined
    );
    // El cliente solo ve el mensaje amable; el detalle técnico (respuesta cruda
    // de Gemini, código de estado) va a la consola para poder diagnosticar.
    if (body?.detail) console.error("Mesero IA — detalle del fallo:", body.detail);
    throw new Error(body?.error ?? error.message ?? "No se pudo contactar al asistente.");
  }

  return {
    reply: data.reply as string,
    productIds: (data.productIds as string[]) ?? [],
    orderItems: (data.orderItems as ProposedOrderItem[]) ?? [],
  };
}
