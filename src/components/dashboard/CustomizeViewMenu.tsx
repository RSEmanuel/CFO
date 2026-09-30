"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/context/LocaleContext";
import {
  DASHBOARD_WIDGET_KEYS,
  type DashboardWidgetKey,
} from "@/hooks/use-dashboard-widgets";
import { Settings2 } from "lucide-react";

type CustomizeViewMenuProps = {
  widgets: Record<DashboardWidgetKey, boolean>;
  onToggle: (key: DashboardWidgetKey, visible: boolean) => void;
};

export function CustomizeViewMenu({ widgets, onToggle }: CustomizeViewMenuProps) {
  const { t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          {t("widgets.customize")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("widgets.customizeHelp")}</p>
        {DASHBOARD_WIDGET_KEYS.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={widgets[key]}
            onCheckedChange={(checked) => onToggle(key, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {t(`widgets.${key}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
