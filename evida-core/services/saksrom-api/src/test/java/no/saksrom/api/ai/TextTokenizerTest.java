package no.saksrom.api.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TextTokenizerTest {

    @Test
    void tokensConcatenateBackToOriginalText() {
        String text = "Rettsboken dokumenterer behandling av saken 12. mars.\n\nAvtalen er signert.";
        List<String> tokens = TextTokenizer.tokenize(text);
        assertEquals(text, String.join("", tokens));
    }

    @Test
    void emitsSmallTokensNotWholeSentences() {
        List<String> tokens = TextTokenizer.tokenize("Foreløpig kildegrunnlag fra klare PageUnits.");
        // Word-level: at least one token per whitespace-separated word.
        assertTrue(tokens.size() >= 5, "expected word-level tokens, got " + tokens);
        assertTrue(tokens.stream().allMatch(t -> t.length() <= TextTokenizer.MAX_TOKEN_LENGTH));
    }

    @Test
    void splitsUnusuallyLongUnbrokenTokens() {
        String url = "https://example.test/" + "a".repeat(80);
        List<String> tokens = TextTokenizer.tokenize(url);
        assertTrue(tokens.size() > 1);
        assertTrue(tokens.stream().allMatch(t -> t.length() <= TextTokenizer.MAX_TOKEN_LENGTH));
        assertEquals(url, String.join("", tokens));
    }

    @Test
    void handlesNullAndEmpty() {
        assertTrue(TextTokenizer.tokenize(null).isEmpty());
        assertTrue(TextTokenizer.tokenize("").isEmpty());
    }

    @Test
    void preservesLeadingWhitespace() {
        String text = "   leading space";
        assertEquals(text, String.join("", TextTokenizer.tokenize(text)));
    }
}
