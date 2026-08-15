import { describe, it, expect } from "vitest";
import { normalize, stripExtension, matchFileToLesson, type MatchCandidateLesson } from "@/lib/videoMatch";

describe("normalize", () => {
  it("lowercases, collapses non-alphanumeric runs to '-', and trims edges", () => {
    expect(normalize("Math - Fractions (01).mp4")).toBe("math-fractions-01-mp4");
    expect(normalize("math_fractions_01")).toBe("math-fractions-01");
    expect(normalize("--Leading and Trailing--")).toBe("leading-and-trailing");
  });
});

describe("stripExtension", () => {
  it("removes the extension after the last dot", () => {
    expect(stripExtension("lesson-01.mp4")).toBe("lesson-01");
    expect(stripExtension("archive.tar.gz")).toBe("archive.tar");
  });

  it("returns the filename unchanged when there's no extension or a leading dot only", () => {
    expect(stripExtension("noextension")).toBe("noextension");
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
});

describe("matchFileToLesson", () => {
  const lessons: MatchCandidateLesson[] = [
    { id: "math-fractions-01", title: "Fractions Intro" },
    { id: "math-fractions-02", title: "Fractions Advanced" },
    { id: "science-01", title: "Cells" },
  ];

  it("matches an exact normalized id", () => {
    const result = matchFileToLesson("math-fractions-01", lessons);
    expect(result).toEqual({ kind: "matched", lesson: lessons[0], reason: "exact-id" });
  });

  it("matches an exact normalized title when no id matches", () => {
    const result = matchFileToLesson("cells", lessons);
    expect(result).toEqual({ kind: "matched", lesson: lessons[2], reason: "exact-title" });
  });

  it("matches a segment-bounded substring against id", () => {
    const result = matchFileToLesson("intro-math-fractions-01-take2", lessons);
    expect(result).toEqual({ kind: "matched", lesson: lessons[0], reason: "segment-id" });
  });

  it("does not match a substring that isn't segment-bounded", () => {
    // "math-fractions-01" is a substring of "math-fractions-010" but not
    // segment-bounded (no '-' after "01"), so this must not false-positive.
    const result = matchFileToLesson("math-fractions-010", lessons);
    expect(result.kind).not.toBe("matched");
  });

  it("reports ambiguous when multiple lessons share the same normalized id", () => {
    const dupeLessons: MatchCandidateLesson[] = [
      { id: "lesson-01", title: "A" },
      { id: "lesson_01", title: "B" },
    ];
    const result = matchFileToLesson("lesson-01", dupeLessons);
    expect(result.kind).toBe("ambiguous");
  });

  it("returns none when nothing matches at any tier", () => {
    const result = matchFileToLesson("totally-unrelated-filename", lessons);
    expect(result).toEqual({ kind: "none" });
  });
});
