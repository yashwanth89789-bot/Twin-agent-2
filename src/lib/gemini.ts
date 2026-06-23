import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ImagePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export async function generateInitialSolution(prompt: string, image?: ImagePart): Promise<string> {
  const contents: any[] = [{ text: prompt }];
  if (image) {
    contents.push(image);
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      systemInstruction: "You are the Primary Agent. Your role is to generate creative and high-quality content based on user requests. Provide a comprehensive, well-structured, and creative response.",
      temperature: 0.7,
    },
  });
  
  return response.text ?? "";
}

export async function verifyAndOptimize(originalPrompt: string, primarySolution: string, image?: ImagePart, generateImage: boolean = true) {
  const contents: any[] = [
    { text: `Original Request:\n${originalPrompt}\n\nPrimary Agent Solution:\n${primarySolution}\n\nReview the solution above based on the original request. Thoroughly evaluate it for logical fallacies, factual inaccuracies, and biases. Suggest alternative approaches or creative expansions, then provide a final optimized version that integrates these improvements.` }
  ];
  if (image) {
    contents.push(image);
  }

  const properties: any = {
    critique: {
      type: Type.STRING,
      description: "Detailed critique and reasoning for improvements. Explicitly call out any logical fallacies, factual inaccuracies, or biases found. Pitch alternative approaches if applicable."
    },
    optimizedContent: {
      type: Type.STRING,
      description: "The final polished and optimized version of the content."
    }
  };

  const required = ["critique", "optimizedContent"];

  if (generateImage) {
    properties.imagePrompt = {
      type: Type.STRING,
      description: "A highly detailed, descriptive prompt for generating an image that visually represents the final optimized content. Provide a prompt only if the content lends itself well to visual representation. Output an empty string if a visual representation is not suitable."
    };
    required.push("imagePrompt");
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      systemInstruction: "You are the Twin Agent in a Twin Agent System. Your role is to evaluate, verify, and optimize the output of the Primary Agent to improve decision-making accuracy and reliability. Focus specifically on identifying logical fallacies, factual inaccuracies, and potential biases in the Primary Agent's output. Additionally, suggest alternative approaches or creative expansions when appropriate. You must ensure the final response is highly accurate, objectively sound, and perfectly meets the user's intent.",
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: properties,
        required: required
      }
    },
  });
  
  const text = response.text ?? "{}";
  let result: { critique: string; optimizedContent: string; imagePrompt?: string };
  try {
    result = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse twin agent response:", text);
    return { critique: "Failed to parse critique.", optimizedContent: primarySolution, generatedImageUrl: null };
  }

  let generatedImageUrl = null;
  if (generateImage && result.imagePrompt && result.imagePrompt.trim() !== '') {
    try {
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: result.imagePrompt }]
        }
      });
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
           generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
           break;
        }
      }
    } catch (err) {
      console.error("Image generation failed:", err);
    }
  }

  return { critique: result.critique, optimizedContent: result.optimizedContent, generatedImageUrl };
}

