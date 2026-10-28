package rs.rcva.api;

import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Error answered as RFC 9457 Problem Details. Texts are shown to users, so they are in
 * Serbian. {@code errors} maps a request field to a message (400 validation).
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String title;
    private final Map<String, String> errors;

    public ApiException(HttpStatus status, String title, String detail) {
        this(status, title, detail, Map.of());
    }

    public ApiException(HttpStatus status, String title, String detail, Map<String, String> errors) {
        super(detail != null ? detail : title);
        this.status = status;
        this.title = title;
        this.errors = Map.copyOf(errors);
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, "Ne postoji", detail);
    }

    public HttpStatus status() {
        return status;
    }

    public String title() {
        return title;
    }

    /** null when the exception was created without a detail text */
    public String detail() {
        return getMessage().equals(title) ? null : getMessage();
    }

    public Map<String, String> errors() {
        return errors;
    }
}
