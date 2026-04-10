import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedTicketData {
  merchantName: string;
  date: string;
  totalAmount: number;
  currency: string;
  category: string;
}

export interface ExtractedOdometerData {
  odometerValue: number;
}

export async function extractTicketData(base64Image: string): Promise<ExtractedTicketData> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: "Extrae los datos de facturación de esta imagen de ticket o recibo. Devuelve solo JSON en español." },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(',')[1] || base64Image,
          },
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          merchantName: { type: Type.STRING, description: "Nombre del establecimiento o empresa" },
          date: { type: Type.STRING, description: "Fecha de la transacción en formato YYYY-MM-DD" },
          totalAmount: { type: Type.NUMBER, description: "Importe total pagado" },
          currency: { type: Type.STRING, description: "Código de moneda (ej. EUR, USD)" },
          category: { type: Type.STRING, description: "Categoría del gasto (ej. Comida, Transporte, Suministros)" },
        },
        required: ["merchantName", "totalAmount"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No se extrajeron datos de la imagen");
  
  return JSON.parse(text) as ExtractedTicketData;
}

export async function extractOdometerData(base64Image: string): Promise<ExtractedOdometerData> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: "Extrae el valor numérico del odómetro (kilometraje) de esta imagen del tablero de un coche. Devuelve solo el número total de kilómetros en JSON." },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(',')[1] || base64Image,
          },
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          odometerValue: { type: Type.NUMBER, description: "Valor total del kilometraje mostrado" },
        },
        required: ["odometerValue"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No se pudo leer el kilometraje");
  
  return JSON.parse(text) as ExtractedOdometerData;
}
