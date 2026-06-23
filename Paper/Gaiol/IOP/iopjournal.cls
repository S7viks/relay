% Minimal IOP-style class stub for local/Overleaf compile when official bundle is missing.
% Replace with the official iopjournal.cls from IOP Publishing when available.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{iopjournal}[2024/01/01 Minimal IOP journal stub]
\LoadClass[12pt,a4paper]{article}

\RequirePackage{graphicx}
\RequirePackage{amsmath,amssymb}

\newcommand{\articletype}[1]{\gdef\@articletype{#1}}
\newcommand{\affil}[1]{\par\noindent{\small #1}\par}
\newcommand{\email}[1]{\par\noindent\textit{E-mail:} #1\par}
\newcommand{\keywords}[1]{\par\vspace{0.5em}\noindent\textbf{Keywords:} #1\par}
\newcommand{\ack}[1]{\section*{Acknowledgments}\noindent #1\par}
\newcommand{\funding}[1]{\section*{Funding}\noindent #1\par}
\newcommand{\roles}[1]{\section*{Author contributions}\noindent #1\par}
\newcommand{\data}[1]{\section*{Data availability}\noindent #1\par}

\renewcommand{\maketitle}{%
  \begin{center}
  {\large\@articletype\par\vspace{0.5em}}
  {\LARGE\bfseries\@title\par\vspace{1em}}
  {\@author\par\vspace{0.5em}}
  \end{center}
}

\AtBeginDocument{\maketitle}
