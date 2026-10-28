"use client";

import { createContext, useContext, useState } from "react";

type SelectedVariant = { variantId: string | null; setVariantId: (id: string | null) => void };

const Context = createContext<SelectedVariant>({ variantId: null, setVariantId: () => {} });

/** Shares the option chosen in the buy box with the photo gallery. */
export function SelectedVariantProvider({
  initial,
  children,
}: {
  initial: string | null;
  children: React.ReactNode;
}) {
  const [variantId, setVariantId] = useState(initial);
  return <Context.Provider value={{ variantId, setVariantId }}>{children}</Context.Provider>;
}

export const useSelectedVariant = () => useContext(Context);
