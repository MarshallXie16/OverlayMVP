import { GoogleGenAI, Type } from "@google/genai";
import { Step, AIAnalysisResult } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeWorkflowReliability = async (workflowTitle: string, steps: Step[]): Promise<AIAnalysisResult> => {
    const prompt = `
    You are an expert QA Automation Engineer and UX Specialist.
    Analyze the following browser automation workflow for potential reliability issues (flakiness) and user experience bottlenecks.
    
    Workflow Title: ${workflowTitle}
    
    Steps:
    ${JSON.stringify(steps.map(s => ({ id: s.id, action: s.actionType, selector: s.selector, label: s.label, confidence: s.confidence })), null, 2)}
    
    Provide a deep analysis on:
    1. Selector fragility (e.g., reliance on dynamic IDs).
    2. Ambiguous steps where the AI confidence was low.
    3. Logic gaps.

    Return the response in JSON format.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Required by prompt instructions
            contents: prompt,
            config: {
                thinkingConfig: {
                    thinkingBudget: 32768 // Max thinking budget for deep analysis
                },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING, description: "A high-level executive summary of the workflow health." },
                        riskScore: { type: Type.NUMBER, description: "0 to 100 score where 100 is high risk." },
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    stepId: { type: Type.STRING },
                                    issue: { type: Type.STRING },
                                    recommendation: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");
        
        return JSON.parse(text) as AIAnalysisResult;

    } catch (error) {
        console.error("Error analyzing workflow:", error);
        // Fallback mock response if API fails or key is missing
        return {
            summary: "Unable to perform deep analysis at this time. However, based on heuristics, steps with low confidence scores should be manually reviewed.",
            riskScore: 50,
            suggestions: []
        };
    }
};