package rs.rcva.api;

import java.util.TreeMap;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.util.unit.DataSize;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/**
 * Turns errors into Problem Details (application/problem+json) with the extension members
 * the frontend reads: {@code errors} (field -> message). See dopuna 1, section 8.
 * Ordered first, so Spring's built-in Problem Details handler (English titles) does not
 * take the exceptions handled here.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ProblemDetail handle(ApiException e) {
        ProblemDetail problem = ProblemDetail.forStatus(e.status());
        problem.setTitle(e.title());
        problem.setDetail(e.detail());
        if (!e.errors().isEmpty()) {
            problem.setProperty("errors", new TreeMap<>(e.errors()));
        }
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail unreadableBody(HttpMessageNotReadableException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Neispravan zahtev");
        problem.setDetail("Telo zahteva nije ispravan JSON ili polje ima pogrešan tip.");
        return problem;
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    ProblemDetail missingPart(MissingServletRequestPartException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Fajl nedostaje");
        problem.setDetail("Zahtev mora sadržati fajl u polju „" + e.getRequestPartName() + "“.");
        return problem;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail tooLarge(MaxUploadSizeExceededException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONTENT_TOO_LARGE);
        problem.setTitle("Fajl je prevelik");
        problem.setDetail("Fajl je veći od dozvoljenih " + DataSize.ofBytes(e.getMaxUploadSize()).toMegabytes() + " MB.");
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail badPathValue(MethodArgumentTypeMismatchException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Neispravan zahtev");
        problem.setDetail("Vrednost „" + e.getValue() + "“ nije ispravna za „" + e.getName() + "“.");
        return problem;
    }
}
