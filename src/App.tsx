/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Beaker, 
  RefreshCw, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  ChevronRight,
  Microscope,
  Atom,
  Zap,
  Droplets,
  Wind
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { COMMON_ELEMENTS, ElementData } from './elements';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GameState {
  targetElement: ElementData | null;
  flippedElements: Set<number>;
  currentClue: string;
  aiFeedback: string;
  isGameOver: boolean;
  history: { clue: string; matchesTarget: boolean }[];
  lastFlipCorrect: boolean | null;
  revealedInfo: ElementData | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  'nonmetal': 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
  'noble gas': 'bg-purple-500/20 border-purple-500/50 text-purple-400',
  'alkali metal': 'bg-red-500/20 border-red-500/50 text-red-400',
  'alkaline earth metal': 'bg-orange-500/20 border-orange-500/50 text-orange-400',
  'metalloid': 'bg-teal-500/20 border-teal-500/50 text-teal-400',
  'halogen': 'bg-blue-500/20 border-blue-500/50 text-blue-400',
  'transition metal': 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  'post-transition metal': 'bg-blue-300/20 border-blue-300/50 text-blue-300',
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    targetElement: null,
    flippedElements: new Set(),
    currentClue: "Initializing game...",
    aiFeedback: "I've thought of a secret element. I'll give you clues to help you find it!",
    isGameOver: false,
    history: [],
    lastFlipCorrect: null,
    revealedInfo: null,
  });

  const [isThinking, setIsThinking] = useState(false);

  const startNewGame = useCallback(() => {
    const randomElement = COMMON_ELEMENTS[Math.floor(Math.random() * COMMON_ELEMENTS.length)];
    setGameState({
      targetElement: randomElement,
      flippedElements: new Set(),
      currentClue: "",
      aiFeedback: "I've picked a secret element. Here is your first clue!",
      isGameOver: false,
      history: [],
      lastFlipCorrect: null,
      revealedInfo: null,
    });
    generateNextClue(randomElement, new Set(), []);
  }, []);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const generateNextClue = async (
    target: ElementData, 
    flipped: Set<number>, 
    history: { clue: string; matchesTarget: boolean }[]
  ) => {
    setIsThinking(true);
    try {
      const remainingElements = COMMON_ELEMENTS.filter(e => !flipped.has(e.number));
      
      if (remainingElements.length === 1) {
        setGameState(prev => ({
          ...prev,
          currentClue: `The element is ${remainingElements[0].name}.`,
          aiFeedback: "You've narrowed it down to the final one! Is this your discovery?",
        }));
        setIsThinking(false);
        return;
      }

      const prompt = `
        You are a chemistry AI assistant playing "Guess Who" with elements.
        Target Element: ${target.name} (Atomic Number: ${target.number}, Symbol: ${target.symbol})
        Remaining Elements on board: ${remainingElements.map(e => e.name).join(', ')}
        
        Rules:
        1. Provide a TRUE statement about the target element that helps narrow down the remaining elements.
        2. The statement MUST start with "This element..." or "This is...".
        3. The statement should be about properties like: state (gas/solid/liquid), category (metal/nonmetal), group, period, common uses, or appearance.
        4. Keep it scientific but accessible.
        5. Return ONLY a JSON object: { "clue": "the statement", "matchesTarget": true }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      setGameState(prev => ({
        ...prev,
        currentClue: result.clue,
        history: [...prev.history, { clue: result.clue, matchesTarget: true }]
      }));
    } catch (error) {
      console.error("AI Error:", error);
      setGameState(prev => ({ ...prev, aiFeedback: "Error generating clue. Try again." }));
    } finally {
      setIsThinking(false);
    }
  };

  const handleFlip = (element: ElementData) => {
    if (gameState.isGameOver || gameState.flippedElements.has(element.number)) return;

    const lastClue = gameState.history[gameState.history.length - 1];
    if (!lastClue) return;

    validateFlip(element, lastClue);
  };

  const validateFlip = async (element: ElementData, lastClue: { clue: string; matchesTarget: boolean }) => {
    setIsThinking(true);
    try {
      const prompt = `
        Game: Guess Who (Chemistry Elements)
        AI's Clue about the Target Element: "${lastClue.clue}"
        (This clue is TRUE for the target element)
        
        The player just flipped down (eliminated) the element: ${element.name} (Atomic Number: ${element.number}).
        
        Task:
        1. Determine if this flip was logically correct. 
           - Since the clue is TRUE for the target, the player should flip down elements that do NOT match the clue.
           - If the flipped element matches the clue, the flip is INCORRECT (they eliminated a potential candidate).
           - If the flipped element does NOT match the clue, the flip is CORRECT.
        2. Provide a short feedback message (max 15 words).
        3. Return ONLY a JSON object: { "isCorrect": true/false, "feedback": "feedback message" }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      
      setGameState(prev => {
        const newFlipped = new Set(prev.flippedElements);
        newFlipped.add(element.number);
        
        const remaining = COMMON_ELEMENTS.filter(e => !newFlipped.has(e.number));
        const isGameOver = remaining.length === 1 && remaining[0].number === prev.targetElement?.number;

        return {
          ...prev,
          flippedElements: newFlipped,
          aiFeedback: result.feedback,
          lastFlipCorrect: result.isCorrect,
          isGameOver,
          revealedInfo: isGameOver ? prev.targetElement : null
        };
      });
    } catch (error) {
      console.error("Validation Error:", error);
    } finally {
      setIsThinking(false);
    }
  };

  const nextClue = () => {
    if (gameState.targetElement) {
      generateNextClue(gameState.targetElement, gameState.flippedElements, gameState.history);
    }
  };

  const remainingCount = COMMON_ELEMENTS.length - gameState.flippedElements.size;

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-center rounded-sm">
            <Beaker size={24} />
          </div>
          <div>
            <h1 className="font-serif italic text-2xl leading-none">Element Guess Who</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-50 mt-1 font-mono">Periodic Table Discovery Engine v1.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest opacity-50 font-mono">Remaining</span>
            <span className="font-mono text-xl font-bold">{remainingCount} / {COMMON_ELEMENTS.length}</span>
          </div>
          <button 
            onClick={startNewGame}
            className="p-3 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors rounded-sm group"
            title="New Game"
          >
            <RefreshCw size={20} className="group-active:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Panel: AI Assistant */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-[#141414] p-6 rounded-sm shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] sticky top-28">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest font-bold">AI Assistant Active</span>
            </div>
            
            <div className="min-h-[120px] mb-6">
              <AnimatePresence mode="wait">
                {isThinking ? (
                  <motion.div 
                    key="thinking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full py-8"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                          className="w-1.5 h-1.5 bg-[#141414] rounded-full"
                        />
                      ))}
                    </div>
                    <p className="text-xs font-mono mt-4 opacity-50 uppercase tracking-tighter">Analyzing Atomic Structure...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="question"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-4 bg-[#141414]/5 border-l-4 border-[#141414] italic font-serif text-lg">
                      "{gameState.currentClue || "Ready to begin?"}"
                    </div>
                    
                    {gameState.aiFeedback && (
                      <div className={`flex items-start gap-2 p-3 rounded-sm text-sm ${
                        gameState.lastFlipCorrect === true ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        gameState.lastFlipCorrect === false ? 'bg-red-50 text-red-800 border border-red-200' :
                        'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}>
                        {gameState.lastFlipCorrect === true ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> :
                         gameState.lastFlipCorrect === false ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> :
                         <Info size={16} className="mt-0.5 shrink-0" />}
                        <p>{gameState.aiFeedback}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={nextClue}
              disabled={isThinking || gameState.isGameOver}
              className="w-full py-3 bg-[#141414] text-[#E4E3E0] rounded-sm font-bold flex items-center justify-center gap-2 hover:bg-[#141414]/90 disabled:opacity-50 transition-opacity"
            >
              Next Clue <ChevronRight size={18} />
            </button>
          </div>

          {/* History */}
          <div className="bg-white/50 border border-[#141414]/20 p-4 rounded-sm">
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-3 opacity-50">Clue History</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {gameState.history.map((h, i) => (
                <div key={i} className="text-xs border-b border-[#141414]/10 pb-2 last:border-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono opacity-50">Clue #{i + 1}</span>
                  </div>
                  <p className="font-serif italic">{h.clue}</p>
                </div>
              ))}
              {gameState.history.length === 0 && (
                <p className="text-xs italic opacity-40 text-center py-4">No clues provided yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Board */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {COMMON_ELEMENTS.map((element) => {
              const isFlipped = gameState.flippedElements.has(element.number);
              return (
                <motion.div
                  key={element.number}
                  layout
                  onClick={() => handleFlip(element)}
                  className={`relative h-40 cursor-pointer group perspective-1000`}
                >
                  <motion.div
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                    className="w-full h-full relative preserve-3d"
                  >
                    {/* Front Side */}
                    <div className="absolute inset-0 backface-hidden bg-white border border-[#141414] p-4 flex flex-col items-center justify-center shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all">
                      <span className="absolute top-2 left-2 font-mono text-xs opacity-30">{element.number}</span>
                      <span className="text-4xl font-bold tracking-tighter">{element.symbol}</span>
                      <div className="mt-2 w-full h-px bg-[#141414]/10" />
                      <span className="mt-2 text-[10px] uppercase tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity">Flip Down</span>
                    </div>

                    {/* Back Side (Flipped) */}
                    <div className="absolute inset-0 backface-hidden bg-[#141414]/5 border border-[#141414]/20 p-4 flex flex-col items-center justify-center rotate-y-180 grayscale opacity-40">
                      <div className="w-12 h-12 border-2 border-[#141414]/20 rounded-full flex items-center justify-center">
                        <HelpCircle size={24} className="opacity-20" />
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Game Over Modal / Reveal */}
      <AnimatePresence>
        {gameState.isGameOver && gameState.revealedInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#141414]/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#E4E3E0] border-2 border-[#141414] w-full max-w-2xl overflow-hidden rounded-sm shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)]"
            >
              <div className="bg-[#141414] text-[#E4E3E0] p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={32} className="text-emerald-400" />
                  <div>
                    <h2 className="text-2xl font-serif italic">Discovery Complete!</h2>
                    <p className="text-[10px] uppercase tracking-widest opacity-50 font-mono">Target Element Identified</p>
                  </div>
                </div>
                <button 
                  onClick={startNewGame}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <RefreshCw size={24} />
                </button>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Visual Card */}
                <div className="space-y-4">
                  <div className={`aspect-square rounded-sm border-2 border-[#141414] flex flex-col items-center justify-center p-8 relative overflow-hidden ${CATEGORY_COLORS[gameState.revealedInfo.category] || 'bg-white'}`}>
                    <div className="absolute top-4 left-4 font-mono text-2xl font-bold">{gameState.revealedInfo.number}</div>
                    <div className="text-8xl font-black tracking-tighter mb-2">{gameState.revealedInfo.symbol}</div>
                    <div className="text-2xl font-serif italic">{gameState.revealedInfo.name}</div>
                    <div className="absolute bottom-4 right-4 font-mono text-sm">{gameState.revealedInfo.weight}</div>
                    
                    {/* Decorative background icon */}
                    <div className="absolute -bottom-4 -left-4 opacity-10 rotate-12">
                      {gameState.revealedInfo.state === 'gas' ? <Wind size={120} /> :
                       gameState.revealedInfo.state === 'liquid' ? <Droplets size={120} /> :
                       <Zap size={120} />}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-[#141414] p-3 rounded-sm">
                      <span className="text-[8px] uppercase tracking-widest opacity-50 block mb-1">Category</span>
                      <span className="text-xs font-bold capitalize">{gameState.revealedInfo.category}</span>
                    </div>
                    <div className="bg-white border border-[#141414] p-3 rounded-sm">
                      <span className="text-[8px] uppercase tracking-widest opacity-50 block mb-1">State (RT)</span>
                      <span className="text-xs font-bold capitalize">{gameState.revealedInfo.state}</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                      <Microscope size={12} /> Characteristics
                    </h3>
                    <p className="text-sm leading-relaxed font-serif italic">
                      {gameState.revealedInfo.description}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                      <Zap size={12} /> Common Uses
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {gameState.revealedInfo.commonUses.map((use, i) => (
                        <span key={i} className="px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono rounded-sm">
                          {use}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                      <Atom size={12} /> Periodic Location
                    </h3>
                    <div className="flex gap-4 font-mono text-xs">
                      <div><span className="opacity-50">Group:</span> {gameState.revealedInfo.group}</div>
                      <div><span className="opacity-50">Period:</span> {gameState.revealedInfo.period}</div>
                    </div>
                  </div>

                  <button 
                    onClick={startNewGame}
                    className="w-full py-4 bg-[#141414] text-[#E4E3E0] font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-colors mt-4"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #14141420;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #14141440;
        }
      `}} />
    </div>
  );
}
