import type { IMoveHistoryProps } from "@repo/types";
import { useEffect, useRef } from "react";

const MoveHistory = ({ moves }: IMoveHistoryProps) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [moves]);

    const pairs = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push({ num: Math.floor(i / 2) + 1, w: moves[i]?.san, b: moves[i + 1]?.san });
    }

    return (
        <div className="move-history" ref={ref}>
            {pairs.length === 0 && <p className="move-history__empty">No moves yet</p>}
            {pairs.map(({ num, w, b }) => (
                <div key={num} className="move-pair">
                    <span className="move-num">{num}.</span>
                    <span className="move-san move-san--w">{w}</span>
                    <span className="move-san move-san--b">{b ?? ""}</span>
                </div>
            ))}
        </div>
    );
}

export default MoveHistory