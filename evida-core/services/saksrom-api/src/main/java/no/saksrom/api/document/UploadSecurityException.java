package no.saksrom.api.document;

import org.springframework.http.HttpStatus;

public class UploadSecurityException extends RuntimeException {
    private final String code;
    private final HttpStatus httpStatus;

    public UploadSecurityException(String code, HttpStatus httpStatus) {
        super(code);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public String code() {
        return code;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }
}
