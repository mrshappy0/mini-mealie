import bmcLogo from '@/assets/bmc-logo.svg';

const BuyMeACoffeeButton = () => {
    return (
        <div className="coffee-button-wrapper">
            <a
                href="https://www.buymeacoffee.com/atomos"
                target="_blank"
                className="buy-me-a-coffee-button"
                rel="noreferrer"
            >
                <img src={bmcLogo} alt="Buy Me A Coffee" className="coffee-icon" />
                <span>Buy me a coffee</span>
            </a>
        </div>
    );
};

export default BuyMeACoffeeButton;
