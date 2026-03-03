import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';

const client = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

export class AIMessageService {
  static async generateConnectionMessage(
    name: string,
    title: string | undefined,
    company: string | undefined,
    bio: string | undefined,
    recentPost: string | undefined,
    userCustomPrompt?: string
  ): Promise<string> {
    try {
      const systemPrompt = `Eres un experto en LinkedIn outreach y copywriting en español.
Tu tarea es generar mensajes de conexión personalizados, auténticos y convincentes basados en el perfil del prospecto.

Reglas:
- El mensaje DEBE ser en español
- Máximo 300 caracteres (LinkedIn tiene limite)
- Debe mencionar específicamente algo del perfil o actividad reciente
- Debe ser natural y humano, no robótico
- Debe demostrar valor o interés genuino
- Evita preguntas de cierre (simplemente solicita conexión)
- Sé breve y directo`;

      const userPrompt = userCustomPrompt || `
Genera un mensaje de conexión personalizado para:
- Nombre: ${name}
- Título: ${title || 'No especificado'}
- Empresa: ${company || 'No especificada'}
- Bio: ${bio || 'No disponible'}
- Actividad reciente: ${recentPost || 'No disponible'}

Genera SOLO el mensaje, sin explicaciones adicionales.`;

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022', // Using Haiku for speed and cost
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const message =
        response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Ensure message is not too long for LinkedIn
      if (message.length > 300) {
        return message.substring(0, 297) + '...';
      }

      return message;
    } catch (error: any) {
      console.error('Error generating message:', error);
      // Return a generic fallback message
      return `Hola ${name}, he visto tu perfil y me gustaría conectar. ¡Espero poder intercambiar experiencias contigo!`;
    }
  }

  static async generateFollowUpMessage(
    name: string,
    originalMessage: string,
    rejectionReason?: string
  ): Promise<string> {
    try {
      const systemPrompt = `Eres un experto en LinkedIn outreach.
Tu tarea es generar un mensaje de seguimiento auténtico después de una conexión rechazada o ignorada.

Reglas:
- Mensaje en español
- Máximo 300 caracteres
- Reconoce que quizás el mensaje anterior no fue relevante
- Pregunta específicamente si hay algo en lo que puedas ayudar
- Sé breve y respetuoso`;

      const userPrompt = `
Genera un mensaje de seguimiento para ${name}.
Mensaje original: "${originalMessage}"
${rejectionReason ? `Razón del rechazo: ${rejectionReason}` : ''}

Genera SOLO el mensaje de seguimiento.`;

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const message =
        response.content[0].type === 'text' ? response.content[0].text : '';
      
      if (message.length > 300) {
        return message.substring(0, 297) + '...';
      }

      return message;
    } catch (error: any) {
      console.error('Error generating follow-up message:', error);
      return `Hola de nuevo ${name}, solo quería confirmar si recibiste mi mensaje anterior. ¿Hay algo en lo que pueda ayudarte?`;
    }
  }

  static async analyzeProfile(
    name: string,
    title: string | undefined,
    company: string | undefined,
    bio: string | undefined,
    recentPost: string | undefined
  ): Promise<{
    relevanceScore: number;
    keyTopics: string[];
    recommendedApproach: string;
  }> {
    try {
      const systemPrompt = `Eres un analista experto en prospección B2B en LinkedIn.
Tu tarea es analizar perfiles y determinar la relevancia y el mejor enfoque de outreach.

Responde SIEMPRE en JSON válido con esta estructura exacta:
{
  "relevanceScore": número entre 0 y 100,
  "keyTopics": ["tema1", "tema2", "tema3"],
  "recommendedApproach": "descripción breve del enfoque recomendado"
}`;

      const userPrompt = `Analiza este perfil de LinkedIn:
- Nombre: ${name}
- Título: ${title || 'No especificado'}
- Empresa: ${company || 'No especificada'}
- Bio: ${bio || 'No disponible'}
- Actividad reciente: ${recentPost || 'No disponible'}`;

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      
      try {
        return JSON.parse(text);
      } catch {
        // Return default if parsing fails
        return {
          relevanceScore: 50,
          keyTopics: ['general'],
          recommendedApproach: 'Enfoque estándar de outreach',
        };
      }
    } catch (error: any) {
      console.error('Error analyzing profile:', error);
      return {
        relevanceScore: 0,
        keyTopics: [],
        recommendedApproach: 'Error en análisis',
      };
    }
  }
}
