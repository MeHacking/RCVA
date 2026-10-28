package rs.rcva.domain;

/** Units in texts for users, as the frontend writes them (frontend/src/format/). */
public final class Units {

    private Units() {
    }

    /** 140 -> "14,0" (LDM x 10, one decimal, decimal comma) */
    public static String ldm(int tenths) {
        String sign = tenths < 0 ? "-" : "";
        int abs = Math.abs(tenths);
        return sign + abs / 10 + "," + abs % 10;
    }
}
