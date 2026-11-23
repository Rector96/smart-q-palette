import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingTour, { CBT_TOUR_STEPS, CBT_TOUR_STORAGE_KEY, useOnboardingTour } from "./OnboardingTour";

const originalWidth = window.innerWidth;

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
};

describe("useOnboardingTour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem(CBT_TOUR_STORAGE_KEY);
    setViewportWidth(390);
  });

  afterEach(() => {
    localStorage.removeItem(CBT_TOUR_STORAGE_KEY);
    setViewportWidth(originalWidth);
    vi.useRealTimers();
  });

  it("shows once on mobile and stores completion", () => {
    const { result, unmount } = renderHook(() => useOnboardingTour(CBT_TOUR_STORAGE_KEY));

    act(() => vi.advanceTimersByTime(800));
    expect(result.current.active).toBe(true);

    act(() => result.current.dismiss());
    expect(localStorage.getItem(CBT_TOUR_STORAGE_KEY)).toBe("true");
    unmount();

    const revisit = renderHook(() => useOnboardingTour(CBT_TOUR_STORAGE_KEY));
    act(() => vi.advanceTimersByTime(800));
    expect(revisit.result.current.active).toBe(false);
  });

  it("does not start or mark completion on desktop", () => {
    setViewportWidth(1024);
    const { result } = renderHook(() => useOnboardingTour(CBT_TOUR_STORAGE_KEY));

    act(() => vi.advanceTimersByTime(800));
    expect(result.current.active).toBe(false);

    act(() => result.current.dismiss());
    expect(localStorage.getItem(CBT_TOUR_STORAGE_KEY)).toBeNull();
  });

  it("guides users through the calculator and opens the question navigator step", () => {
    const onStepChange = vi.fn();
    render(
      <OnboardingTour
        active
        onDismiss={vi.fn()}
        onStepChange={onStepChange}
        steps={CBT_TOUR_STEPS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start tour/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Calculator, right when you need it" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Jump to any question" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Your question navigator" })).toBeTruthy();
    expect(onStepChange).toHaveBeenLastCalledWith(4);
  });
});
