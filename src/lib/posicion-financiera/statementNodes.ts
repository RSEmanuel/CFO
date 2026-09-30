import type { StatementNode } from "@/services/posicionFinanciera";

export function findStatementNode(nodes: StatementNode[], id: string): StatementNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findStatementNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function statementNodeValue(nodes: StatementNode[], id: string, yearKey: string): number | null {
  const value = findStatementNode(nodes, id)?.values[yearKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
