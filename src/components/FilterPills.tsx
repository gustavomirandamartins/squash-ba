"use client";

import { useState } from "react";
import { Pill } from "./Pill";
import { filters } from "@/lib/mock/data";

export function FilterPills() {
  const [active, setActive] = useState(filters[0]);
  return (
    <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-5 py-1">
      {filters.map((f) => (
        <Pill
          key={f}
          label={f}
          active={active === f}
          onClick={() => setActive(f)}
        />
      ))}
    </div>
  );
}
