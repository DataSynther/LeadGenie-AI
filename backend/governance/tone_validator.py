import re

BANNED_PHRASES = [
    "game-changer", "revolutionary", "synergy", "disruptive", "paradigm shift",
    "world-class", "cutting-edge", "best-in-class", "next-generation",
    "I wanted to reach out", "hope this email finds you well",
    "just following up", "touching base", "circle back",
]

MAX_SUBJECT_LENGTH = 60
MAX_BODY_SENTENCES = 10


class ToneValidator:
    """Validates outreach tone, length, and brand safety."""

    def validate(self, content: dict) -> dict:
        """
        Validate subject and body of a generated email.
        Returns: {passed: bool, issues: list[str]}
        """
        issues = []
        subject = content.get("subject", "")
        body = content.get("body", "")
        full_text = (subject + " " + body).lower()

        for phrase in BANNED_PHRASES:
            if phrase.lower() in full_text:
                issues.append(f"Banned phrase detected: '{phrase}'")

        if len(subject) > MAX_SUBJECT_LENGTH:
            issues.append(f"Subject too long ({len(subject)} chars, max {MAX_SUBJECT_LENGTH})")

        sentence_count = len(re.split(r'[.!?]+', body.strip()))
        if sentence_count > MAX_BODY_SENTENCES:
            issues.append(f"Body too long ({sentence_count} sentences, max {MAX_BODY_SENTENCES})")

        if body.count("!") > 2:
            issues.append("Excessive exclamation marks — tone too salesy")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }
