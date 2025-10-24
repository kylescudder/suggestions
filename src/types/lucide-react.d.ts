// Minimal type declarations for lucide-react to satisfy TS resolution in this project.
// This file keeps types conservative while allowing icon usage via named imports.

declare module "lucide-react" {
  import * as React from "react";

  export type LucideProps = React.SVGProps<SVGSVGElement> & {
    size?: number | string;
    color?: string;
  };

  export const LogOut: React.FC<LucideProps>;
  // Add other commonly-used icons here as needed, e.g.:
  export const LogIn: React.FC<LucideProps>;
  export const Plus: React.FC<LucideProps>;

  export default {} as { [key: string]: React.FC<LucideProps> };
}

