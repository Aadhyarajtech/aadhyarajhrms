import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string | null;
};

type EmployeeSearchSelectProps = {
  employees: EmployeeOption[];
  value: string;
  onChange: (employeeId: string) => void;
  allLabel: string;
  disabled?: boolean;
};

function getEmployeeLabel(employee: EmployeeOption) {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return employee.employeeCode
    ? `${name} · ${employee.employeeCode}`
    : name;
}

export function EmployeeSearchSelect({
  employees,
  value,
  onChange,
  allLabel,
  disabled = false,
}: EmployeeSearchSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedEmployee = employees.find((employee) => employee.id === value);
  const selectedLabel = selectedEmployee
    ? getEmployeeLabel(selectedEmployee)
    : allLabel;

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) =>
      `${getEmployeeLabel(employee)} ${employee.employeeCode ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  useEffect(() => {
    if (!isOpen) setSearch(selectedLabel);
  }, [isOpen, selectedLabel]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const selectEmployee = (employeeId: string) => {
    onChange(employeeId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="text"
          role="combobox"
          aria-label="Search employees"
          aria-expanded={isOpen}
          aria-controls="employee-search-options"
          aria-autocomplete="list"
          value={isOpen ? search : selectedLabel}
          onFocus={() => {
            setSearch("");
            setIsOpen(true);
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
            if (event.key === "Enter" && isOpen && filteredEmployees[0]) {
              event.preventDefault();
              selectEmployee(filteredEmployees[0].id);
            }
          }}
          placeholder="Type a name or employee code"
          disabled={disabled}
          className="h-10 w-full rounded-xl border border-line bg-white py-2 pl-9 pr-10 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brand-400 disabled:cursor-not-allowed disabled:bg-surface"
        />
        <button
          type="button"
          aria-label={isOpen ? "Close employee list" : "Open employee list"}
          disabled={disabled}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              return;
            }

            setSearch("");
            setIsOpen(true);
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      {isOpen && (
        <div
          id="employee-search-options"
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => selectEmployee("")}
            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface"
          >
            {allLabel}
          </button>
          {filteredEmployees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              role="option"
              aria-selected={employee.id === value}
              onClick={() => selectEmployee(employee.id)}
              className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface"
            >
              {getEmployeeLabel(employee)}
            </button>
          ))}
          {filteredEmployees.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-faint">
              No employees found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}