import type { CourtEngineMessage } from "../../engine/types";

interface ChatAreaProps {
  messages: CourtEngineMessage[];
}

export function ChatArea({ messages }: ChatAreaProps) {
  return (
    <div className="chat-area" aria-label="Court Engine meldinger">
      {messages.map((message, index) => (
        <article key={`${message.timestamp}-${index}`} className={`message ${message.type}`}>
          <div className="message-meta">
            <strong>{message.type.toUpperCase()}</strong>{" "}
            <span>{new Date(message.timestamp).toLocaleString()}</span>
          </div>

          <pre className="message-content">{message.content}</pre>
        </article>
      ))}
    </div>
  );
}
