export interface TableRow {
  package: string;
  file: string;
  comment: string;
}

export interface TableWidths {
  package: number;
  file: number;
  comment: number;
}

export interface TableData {
  headers: TableRow;
  rows: TableRow[];
  widths: TableWidths;
}