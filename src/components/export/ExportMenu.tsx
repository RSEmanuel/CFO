"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/LocaleContext";
import { type ColumnMode, type FileKind } from "@/services/tableExport";
import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";

type ExportMenuProps = {
  disabled?: boolean;
  onDownload: (options: { fileKind: FileKind; columnMode: ColumnMode }) => Promise<void> | void;
};

function RadioRow({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-foreground hover:bg-accent">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        className="h-3.5 w-3.5 accent-clay"
        onChange={onChange}
      />
      {label}
    </label>
  );
}

export function ExportMenu({ disabled = false, onDownload }: ExportMenuProps) {
  const { t } = useLocale();
  const [fileKind, setFileKind] = useState<FileKind>("xlsx");
  const [columnMode, setColumnMode] = useState<ColumnMode>("lectura");
  const [pending, setPending] = useState(false);

  const handleDownload = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      await onDownload({ fileKind, columnMode });
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={disabled}>
          <Download className="h-3.5 w-3.5" />
          {t("common.export")}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3" onCloseAutoFocus={(event) => event.preventDefault()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleDownload();
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <fieldset className="space-y-1 border-0 p-0">
            <legend className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {t("export.type")}
            </legend>
            <RadioRow name="fileKind" value="xlsx" checked={fileKind === "xlsx"} label={t("export.excel")} onChange={() => setFileKind("xlsx")} />
            <RadioRow name="fileKind" value="csv" checked={fileKind === "csv"} label={t("export.csv")} onChange={() => setFileKind("csv")} />
          </fieldset>

          <fieldset className="mt-3 space-y-1 border-0 p-0">
            <legend className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {t("export.columns")}
            </legend>
            <RadioRow
              name="columnMode"
              value="lectura"
              checked={columnMode === "lectura"}
              label={t("export.forReading")}
              onChange={() => setColumnMode("lectura")}
            />
            <RadioRow
              name="columnMode"
              value="sistemas"
              checked={columnMode === "sistemas"}
              label={t("export.forSystems")}
              onChange={() => setColumnMode("sistemas")}
            />
          </fieldset>

          <Button
            type="submit"
            size="sm"
            disabled={pending || disabled}
            className={cn("mt-3 h-8 w-full bg-foreground text-background hover:bg-foreground/90")}
          >
            {t("common.download")}
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
