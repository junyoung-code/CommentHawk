import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PolicyForm, type PolicyFormValues } from "./policy-form";

const initial: PolicyFormValues = { version:0,blocked:"",allowed:"",contextExceptions:"",sensitivity:"standard",cautionAction:"review",riskAction:"hold_for_review",harmfulTextHidden:true };

describe("PolicyForm", () => {
  it("uses defaults only before a first policy; a saved empty selection stays empty", () => {
    const view = render(<PolicyForm action={vi.fn()} initial={initial} />);
    expect(screen.getByRole("button",{name:"외모 비하"})).toHaveAttribute("aria-pressed","true");
    view.unmount();
    render(<PolicyForm action={vi.fn()} initial={{...initial,version:2}} />);
    expect(screen.getByRole("button",{name:"외모 비하"})).toHaveAttribute("aria-pressed","false");
  });
  it("submits selected topics and paired contexts without losing legacy expressions", async () => {
    const action = vi.fn();
    render(<PolicyForm action={action} initial={{...initial,version:2,blocked:"가족 언급",allowed:"기존 표현",contextExceptions:"감자대장 | 팬들의 애칭"}} />);
    expect(screen.getByLabelText("허용하는 상황 1")).toHaveValue("팬들의 애칭");
    expect(screen.getByLabelText("허용할 표현 2")).toHaveValue("기존 표현");
    fireEvent.click(screen.getByRole("button",{name:"스포일러"}));
    fireEvent.change(screen.getByLabelText("직접 추가"),{target:{value:"과도한 비교"}});
    fireEvent.click(screen.getByRole("button",{name:"추가"}));
    fireEvent.click(screen.getByRole("button",{name:"기준 저장"}));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][0] as FormData;
    expect(JSON.parse(String(data.get("topics")))).toEqual(["가족 언급","스포일러","과도한 비교"]);
    expect(JSON.parse(String(data.get("contexts")))).toEqual([{phrase:"감자대장",context:"팬들의 애칭"},{phrase:"기존 표현",context:""}]);
  });
  it("marks samples and preview fixture results explicitly and clears stale results on edits", async () => {
    const previewAction = vi.fn().mockResolvedValue({level:"safe",fixture:true});
    render(<PolicyForm action={vi.fn()} initial={initial} previewAction={previewAction} />);
    expect(screen.getByText("예시 댓글 · 예상 결과")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"다른 댓글로 확인"}));
    fireEvent.change(screen.getByLabelText("확인할 댓글"),{target:{value:"오늘 편집 좋네요"}});
    fireEvent.click(screen.getByRole("button",{name:"현재 기준으로 확인"}));
    await waitFor(() => expect(screen.getByText(/실제 AI 분석이 아닌 테스트 결과/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"가족 언급"}));
    expect(screen.queryByText(/실제 AI 분석이 아닌 테스트 결과/)).not.toBeInTheDocument();
  });
  it("shows the submitted comment and returned reason, then starts another preview", async () => {
    const previewAction = vi.fn().mockResolvedValue({level:"danger",fixture:false,reason:"가족 공격 표현이 감지되어 검토가 필요해요."});
    render(<PolicyForm action={vi.fn()} initial={initial} previewAction={previewAction} />);
    fireEvent.click(screen.getByRole("button",{name:"다른 댓글로 확인"}));
    fireEvent.change(screen.getByLabelText("확인할 댓글"),{target:{value:"확인하려는 댓글 원문"}});
    fireEvent.click(screen.getByRole("button",{name:"현재 기준으로 확인"}));
    expect(await screen.findByText("가족 공격 표현이 감지되어 검토가 필요해요.")).toBeInTheDocument();
    expect(screen.getByText("확인하려는 댓글 원문",{selector:"p"})).toBeInTheDocument();
    expect(screen.getByText("위험")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"다른 댓글로 확인"}));
    expect(screen.getByLabelText("확인할 댓글")).toHaveValue("");
    expect(screen.getByLabelText("확인할 댓글")).toHaveFocus();
    expect(screen.queryByText("위험")).not.toBeInTheDocument();
  });
});
