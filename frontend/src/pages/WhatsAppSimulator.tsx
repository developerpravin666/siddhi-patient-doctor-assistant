import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  PhoneCall,
  MapPin,
  CheckCheck,
  Zap
} from 'lucide-react';
import { simulateWhatsAppMessage, resetWhatsAppSession } from '../api/client';
import { ChatMessage } from '../types';

export const WhatsAppSimulator: React.FC = () => {
  const [phoneNumber] = useState('919009368666');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      text: "Hello! 👋 Welcome to *Dr. Siddhi Patidar's Clinic*.\n\nI would be happy to help you schedule an appointment with Dr. Patel.\n\nMay I please have your *full name*?",
      timestamp: '10:00 AM'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<any>({
    step: 1,
    patient_name: null,
    mobile_number: null,
    selected_date: null,
    selected_slot: null,
    offered_slots: []
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Add user message
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: timeNow
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setLoading(true);

    try {
      const res = await simulateWhatsAppMessage({
        phone_number: phoneNumber,
        message_text: text
      });

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: res.reply_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsExecuted: res.tools_executed
      };

      setMessages((prev) => [...prev, botMsg]);
      if (res.session_state) {
        setSessionState(res.session_state);
      }
    } catch (err) {
      console.error("Simulation error", err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'bot',
        text: "⚠️ [Simulator Connection Error] Could not reach the backend.",
        timestamp: timeNow
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await resetWhatsAppSession(phoneNumber);
      setMessages([
        {
          id: `m-${Date.now()}`,
          sender: 'bot',
          text: "Hello! 👋 Welcome to *Dr. Siddhi Patidar's Clinic*.\n\nI would be happy to help you schedule an appointment with Dr. Patel.\n\nMay I please have your *full name*?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setSessionState({
        step: 1,
        patient_name: null,
        mobile_number: null,
        selected_date: null,
        selected_slot: null,
        offered_slots: []
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleScenario = (text: string) => {
    handleSendMessage(text);
  };

  // Helper to format WhatsApp markdown (*bold*, _italic_) into HTML spans
  const formatWhatsAppText = (raw: string) => {
    return raw.split('\n').map((line, lineIdx) => {
      // Basic bold parsing: *text*
      const parts = line.split(/(\*[^*]+\*)/g);
      return (
        <React.Fragment key={lineIdx}>
          {parts.map((part, pIdx) => {
            if (part.startsWith('*') && part.endsWith('*')) {
              return <strong key={pIdx} className="font-bold">{part.slice(1, -1)}</strong>;
            }
            return part;
          })}
          {lineIdx < raw.split('\n').length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: WhatsApp Mobile Frame (Cols 7) */}
      <div className="lg:col-span-7 flex justify-center">
        <div className="w-full max-w-md bg-slate-900 rounded-[36px] p-3 shadow-2xl border-4 border-slate-800">
          {/* Mobile Screen Shell */}
          <div className="bg-whatsapp-chatbg rounded-[28px] overflow-hidden flex flex-col h-[650px] relative">
            {/* WhatsApp Top Bar */}
            <div className="bg-whatsapp-teal text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                    SP
                  </div>
                  <span className="w-2.5 h-2.5 bg-whatsapp-light rounded-full absolute bottom-0 right-0 border-2 border-whatsapp-teal"></span>
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight">Dr. Siddhi Patidar's Clinic</h4>
                  <p className="text-[11px] text-emerald-200">Official WhatsApp Medical Assistant</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                title="Reset Conversation Session"
                className="p-2 hover:bg-white/10 rounded-full transition text-xs font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-[#EFEAE2] bg-opacity-95">
              <div className="text-center my-2">
                <span className="bg-white/80 backdrop-blur-sm text-slate-500 text-[10px] px-2.5 py-1 rounded-md shadow-xs font-medium">
                  TODAY • END-TO-END ENCRYPTED
                </span>
              </div>

              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    {/* Tool execution badge */}
                    {m.toolsExecuted && m.toolsExecuted.length > 0 && (
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-brand-700 bg-brand-100/90 px-2 py-0.5 rounded-full shadow-xs">
                        <Zap className="w-3 h-3 text-brand-600" />
                        <span>Invoked: {m.toolsExecuted.join(', ')}</span>
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm text-xs text-slate-800 leading-relaxed ${isUser
                        ? 'bg-[#DCF8C6] rounded-tr-none'
                        : 'bg-white rounded-tl-none border border-slate-100'
                        }`}
                    >
                      <div className="whitespace-pre-wrap">{formatWhatsAppText(m.text)}</div>
                      <div className="text-[9px] text-slate-400 mt-1 flex items-center justify-end gap-1">
                        <span>{m.timestamp}</span>
                        {isUser && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl rounded-tl-none shadow-sm max-w-[120px] text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  <span>Typing...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-2.5 bg-[#F0F2F5] border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message as patient..."
                className="flex-1 bg-white px-3.5 py-2 rounded-xl text-xs border-none focus:outline-none focus:ring-1 focus:ring-whatsapp-light shadow-xs"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || loading}
                className="w-8 h-8 rounded-full bg-whatsapp-light text-white flex items-center justify-center hover:bg-emerald-600 transition shadow-sm disabled:opacity-40"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Column: Scenarios & Session State Inspector (Cols 5) */}
      <div className="lg:col-span-5 space-y-5">
        {/* Scenario Quick Starts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand-600" />
              One-Click Test Scenarios (from BUSINESS_FLOW.md)
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            {/* Scenario A */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-800 flex items-center justify-between">
                <span>Scenario A: Happy Path Booking</span>
                <span className="text-[10px] text-emerald-600 font-semibold">5-Step Flow</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleScenario("Hi there, I need to see Dr. Siddhi.")}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-600 transition"
                >
                  Step 1: "Hi there"
                </button>
                <button
                  onClick={() => handleScenario("Sneha Kulkarni")}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-600 transition"
                >
                  Step 2: "Sneha Kulkarni"
                </button>
                <button
                  onClick={() => handleScenario("9009368666")}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-600 transition"
                >
                  Step 3: "9009368666"
                </button>
                <button
                  onClick={() => handleScenario("Option 2 please")}
                  className="px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-300 text-brand-700 hover:bg-brand-100 transition font-bold"
                >
                  Step 4: "Option 2 please"
                </button>
              </div>
            </div>

            {/* Scenario B */}
            <button
              onClick={() => handleScenario("My husband has severe chest pain and cannot breathe, what medicine should I give?")}
              className="text-left p-3 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100/70 transition space-y-1"
            >
              <p className="font-bold text-rose-900 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Scenario B: Medical Emergency Deflection
              </p>
              <p className="text-[11px] text-rose-700 italic">
                "My husband has severe chest pain and cannot breathe..."
              </p>
            </button>

            {/* Scenario C */}
            <button
              onClick={() => handleScenario("Where is your clinic located and what are the consultation hours?")}
              className="text-left p-3 rounded-xl bg-sky-50 border border-sky-200 hover:bg-sky-100/70 transition space-y-1"
            >
              <p className="font-bold text-sky-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600" /> Scenario C: Clinic Timings & Location
              </p>
              <p className="text-[11px] text-sky-700 italic">
                "Where is your clinic located and what are the hours?"
              </p>
            </button>

            {/* Scenario D */}
            <button
              onClick={() => handleScenario("I need to speak directly with a doctor or human receptionist right now!")}
              className="text-left p-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100/70 transition space-y-1"
            >
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-amber-600" /> Scenario D: Front-Desk Human Hand-off
              </p>
              <p className="text-[11px] text-amber-700 italic">
                "I need to speak directly with a doctor right now!"
              </p>
            </button>
          </div>
        </div>

        {/* Live Session State Inspector */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Redis Session State (30m TTL)
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">session:{phoneNumber}</span>
          </div>

          <div className="bg-slate-900 rounded-xl p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto space-y-1">
            <div><span className="text-slate-400">patient_name:</span> "{sessionState.patient_name || 'null'}"</div>
            <div><span className="text-slate-400">mobile_number:</span> "{sessionState.mobile_number || 'null'}"</div>
            <div><span className="text-slate-400">selected_date:</span> "{sessionState.selected_date || 'null'}"</div>
            <div><span className="text-slate-400">selected_slot:</span> "{sessionState.selected_slot || 'null'}"</div>
            <div><span className="text-slate-400">step:</span> {sessionState.step || 1}</div>
            <div>
              <span className="text-slate-400">offered_slots:</span> [
              {sessionState.offered_slots && sessionState.offered_slots.join(', ')}]
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
