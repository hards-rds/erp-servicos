"use client";

type DeleteServiceButtonProps = {
  disabled: boolean;
};

export function DeleteServiceButton({ disabled }: DeleteServiceButtonProps) {
  return (
    <button
      className="danger-button compact-button"
      type="submit"
      disabled={disabled}
      title={disabled ? "Altere o status para cancelado antes de excluir" : "Excluir servico"}
      onClick={(event) => {
        if (!window.confirm("Excluir este servico permanentemente?")) {
          event.preventDefault();
        }
      }}
    >
      Excluir
    </button>
  );
}
