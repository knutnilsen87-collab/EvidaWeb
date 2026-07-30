package no.saksrom.api.ai;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits a finished text into small, streamable tokens so a response can be piped to the client
 * word-by-word instead of as one large block.
 *
 * <p>Guarantees:
 * <ul>
 *   <li>Concatenating all returned tokens reproduces the input text exactly (whitespace preserved).</li>
 *   <li>Each token is a "word" plus its trailing whitespace, so the client can render natural word
 *       boundaries. Paragraph breaks ({@code \n}) are emitted as their own tokens so structure streams
 *       in visibly.</li>
 *   <li>Unusually long unbroken tokens (e.g. long URLs) are hard-split so no single SSE event is huge.</li>
 * </ul>
 *
 * <p>This is deliberately model-agnostic: today the underlying answer is composed deterministically,
 * but if a real LLM token stream is wired in later, its tokens can be forwarded through the same
 * {@link SseAiStreamer} sink without changing the transport.
 */
public final class TextTokenizer {

    /** Maximum characters per emitted token before it is hard-split. */
    static final int MAX_TOKEN_LENGTH = 24;

    private TextTokenizer() {
    }

    public static List<String> tokenize(String text) {
        List<String> tokens = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return tokens;
        }

        int index = 0;
        int length = text.length();
        while (index < length) {
            int start = index;

            // Consume the non-whitespace run (the "word").
            while (index < length && !Character.isWhitespace(text.charAt(index))) {
                index++;
            }

            // Consume the trailing whitespace run, but stop right after a newline so paragraph
            // breaks stream as their own visible token.
            while (index < length && Character.isWhitespace(text.charAt(index))) {
                index++;
                if (text.charAt(index - 1) == '\n') {
                    break;
                }
            }

            String token = text.substring(start, index);
            if (token.length() > MAX_TOKEN_LENGTH) {
                for (int offset = 0; offset < token.length(); offset += MAX_TOKEN_LENGTH) {
                    tokens.add(token.substring(offset, Math.min(token.length(), offset + MAX_TOKEN_LENGTH)));
                }
            } else {
                tokens.add(token);
            }
        }
        return tokens;
    }
}
