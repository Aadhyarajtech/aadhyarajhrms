import { useState } from "react";
import {
  Brain,
  Send,
  Sparkles,
} from "lucide-react";

import { AttendanceApi } from "@/lib/endpoints";
import { useToast } from "@/context/ToastContext";

const suggestions = [
  "How is my attendance this month?",
  "Why is my attendance score this way?",
  "How are my working hours?",
  "Are there any unusual attendance patterns?",
];

export default function AskAI({
  employeeId,
}: {
  employeeId?: string;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast();

  const handleAsk = async (value?: string) => {
    const selectedQuestion = (
      value ?? question
    ).trim();

    if (!selectedQuestion) {
      showToast(
        "Please enter a question.",
        "error",
      );
      return;
    }

    try {
      setLoading(true);
      setAnswer("");

      const result =
        await AttendanceApi.askAI(
          selectedQuestion,
          employeeId,
        );

      setAnswer(result);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Unable to get an answer. Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAsk();
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">

      {/* HEADER */}
      <div className="flex items-center gap-4">

        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] bg-purple-100">
          <Brain
            size={36}
            strokeWidth={1.8}
            className="text-purple-600"
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[26px] font-semibold text-gray-900">
              Ask AI
            </h2>

            <Sparkles
              size={22}
              className="text-purple-600"
            />
          </div>

          <p className="mt-1 text-[16px] text-gray-500">
            Ask questions about your attendance
          </p>
        </div>

      </div>

      {/* ANSWER */}
      {answer && (
        <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-5">

          <div className="flex items-start gap-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100">
              <Brain
                size={18}
                className="text-purple-600"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-900">
                AI Answer
              </p>

              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                {answer}
              </p>
            </div>

          </div>

        </div>
      )}

      {/* SUGGESTIONS */}
      <div className="mt-6 flex flex-wrap gap-3">

        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuestion(suggestion);
              handleAsk(suggestion);
            }}
            className="rounded-full border border-gray-200 bg-white px-4 py-2.5 text-[15px] text-gray-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}

      </div>

      {/* INPUT */}
      <div className="mt-6 flex items-center gap-3">

        <div className="flex h-[68px] flex-1 items-center rounded-[18px] border border-gray-200 bg-white px-5 transition focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100">

          <input
            type="text"
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder={
              employeeId
                ? "Ask something about this employee's attendance..."
                : "Ask something about attendance..."
            }
            maxLength={500}
            disabled={loading}
            className="w-full bg-transparent text-[17px] text-gray-900 outline-none placeholder:text-gray-400"
          />

        </div>

        {/* ASK BUTTON */}
        <button
          type="button"
          onClick={() => handleAsk()}
          disabled={
            loading ||
            !question.trim()
          }
          className="flex h-[68px] min-w-[120px] items-center justify-center gap-2 rounded-[18px] bg-purple-500 px-6 text-[16px] font-medium text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send
            size={20}
            strokeWidth={2}
          />

          {loading
            ? "Asking..."
            : "Ask"}
        </button>

      </div>

    </section>
  );
}