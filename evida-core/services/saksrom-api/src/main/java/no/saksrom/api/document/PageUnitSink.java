package no.saksrom.api.document;

/**
 * Receives one parsed page at a time from a streaming parser. Implementations persist the page
 * before the parser continues, so memory does not scale with total page count. Any exception
 * thrown from the sink aborts the parse and fails the job closed.
 */
@FunctionalInterface
public interface PageUnitSink {
    void accept(PageUnit page);
}
