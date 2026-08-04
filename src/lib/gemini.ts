import { supabase } from "./supabaseClient";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askRestaurantAssistant(
  qrToken: string,
  message: string,
  history: ChatMessage[]
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("gemini-chat", {
    body: { qrToken, message, history },
  });

  if (error) {
    throw new Error(error.message ?? "No se pudo contactar al asistente.");
  }

  return data.reply as string;
}
