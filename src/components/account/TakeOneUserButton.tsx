import { UserButton } from '@clerk/clerk-react';
import { CreditCard, SlidersHorizontal } from 'lucide-react';
import { memo } from 'react';
import AccountBilling from './AccountBilling';
import AccountPreferences from './AccountPreferences';

const TakeOneUserButton = memo(function TakeOneUserButton() {
  return (
    <UserButton afterSignOutUrl="/">
      <UserButton.UserProfilePage label="account" />
      <UserButton.UserProfilePage label="Preferences" url="preferences" labelIcon={<SlidersHorizontal aria-hidden="true" size={16} />}>
        <AccountPreferences />
      </UserButton.UserProfilePage>
      <UserButton.UserProfilePage label="security" />
      <UserButton.UserProfilePage label="Billing" url="billing" labelIcon={<CreditCard aria-hidden="true" size={16} />}>
        <AccountBilling />
      </UserButton.UserProfilePage>
    </UserButton>
  );
});

export default TakeOneUserButton;
