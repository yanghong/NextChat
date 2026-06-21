import {
  buildLearningLaunchMessage,
  buildLearningSystemPrompt,
  createDefaultLearningMode,
  parseLearningCommand,
} from "../app/utils/learning";

describe("learning mode utilities", () => {
  test("parses Chinese learning start commands with strict boundaries", () => {
    expect(parseLearningCommand("/学习")).toEqual({
      type: "start",
      intent: "",
    });
    expect(parseLearningCommand("/学习 React Hooks")).toEqual({
      type: "start",
      intent: "React Hooks",
    });
    expect(parseLearningCommand("/学习React")).toEqual({
      type: "none",
      raw: "/学习React",
    });
  });

  test("parses English learning start commands with strict boundaries", () => {
    expect(parseLearningCommand("/learn Python")).toEqual({
      type: "start",
      intent: "Python",
    });
    expect(parseLearningCommand("/study SQL")).toEqual({
      type: "start",
      intent: "SQL",
    });
    expect(parseLearningCommand("/learnPython")).toEqual({
      type: "none",
      raw: "/learnPython",
    });
  });

  test("parses learning stop commands", () => {
    expect(parseLearningCommand("/退出学习")).toEqual({ type: "stop" });
    expect(parseLearningCommand("/exit-learn")).toEqual({ type: "stop" });
  });

  test("builds diagnostic launch messages without exposing raw slash commands", () => {
    expect(buildLearningLaunchMessage("React")).toContain(
      "学习目标初步是：React",
    );
    expect(buildLearningLaunchMessage("React")).not.toContain("/学习");
    expect(buildLearningLaunchMessage("")).toContain("请先问我想学什么");
  });

  test("builds a tutor system prompt that asks diagnostic questions", () => {
    const prompt = buildLearningSystemPrompt(
      createDefaultLearningMode("React Hooks"),
    );

    expect(prompt).toContain("学习导师");
    expect(prompt).toContain("每轮最多问 1-3 个问题");
    expect(prompt).toContain("学习档案");
    expect(prompt).toContain("React Hooks");
  });
});
