import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { logoutAction } from "@/app/(app)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  name: string;
  email: string;
  isAdmin: boolean;
}

export function UserMenu({ name, email, isAdmin }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-1.5">
          <Avatar className="size-6">
            <AvatarFallback className="text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck className="mr-2 size-4" />
                Trang quản trị
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logoutAction} className="w-full">
            <button type="submit" className="flex w-full items-center">
              <LogOut className="mr-2 size-4" />
              Đăng xuất
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
