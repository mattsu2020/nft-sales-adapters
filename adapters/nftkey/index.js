require("dotenv").config();

const moment = require("moment");
const Avalanche = require("../../sdk/EVMC");
const axios = require("axios");
const URL = "http://nft-sales-service.dappradar.com/open-source";
const KEY = process.env.DAPPRADAR_API_KEY;
const path = require("path");
const BigNumber = require("bignumber.js");

class NFTKey {
    constructor() {
        this.name = "nftkey";
        this.symbol = "AVAX";
        this.token = "0x0000000000000000000000000000000000000000";
        this.protocol = "avalanche";
        this.block = 6421617;
        this.contract = "0x1A7d6ed890b6C284271AD27E7AbE8Fb5211D0739";
        this.events = ["TokenBought"];
        this.pathToAbi = path.join(__dirname, "./abi.json");
        this.range = 500;
        this.chunkSize = 6;
        this.sdk = undefined;
    }

    run = async () => {
        const s = await this.getSymbol();
        this.sdk = this.loadSdk();
        this.symbol = s;
        await this.sdk.run();
    };

    loadSdk = () => {
        return new Avalanche(this);
    };

    getSymbol = async () => {
        const resp = await axios.get(
            `${URL}/token-metadata?key=${KEY}&token_address=${this.token}&protocol=${this.protocol}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4619.141 Safari/537.36",
                },
            },
        );
        return resp.data;
    };

    getPrice = async timestamp => {
        const resp = await axios.get(
            `${URL}/token-price?key=${KEY}&token_address=${this.token}&protocol=${this.protocol}&timestamp=${timestamp}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4619.141 Safari/537.36",
                },
            },
        );
        return resp.data;
    };

    stop = async () => {
        this.sdk.stop();
    };

    getBuyer = async event => {
        const buyer = event.returnValues.owner;
        if (event.event === "TokenBought") {
            const txReceipt = await this.sdk.getTransactionReceipt(event.transactionHash);
            if (txReceipt === null) {
                return null;
            }
            return txReceipt.from;
        }
        return buyer;
    };

    _getPrice = async (event, block) => {
        if (!this.symbol.decimals) {
            return { price: null, priceUsd: null };
        }

        const po = await this.getPrice(block.timestamp);
        const nativePrice = new BigNumber(event.returnValues.price).dividedBy(10 ** this.symbol.decimals);

        return {
            price: nativePrice.toNumber(),
            priceUsd: nativePrice.multipliedBy(po.price).toNumber(),
        };
    };

    process = async event => {
        const block = await this.sdk.getBlock(event.blockNumber);
        const timestamp = moment.unix(block.timestamp).utc();
        const buyer = await this.getBuyer(event);
        if (!buyer) {
            return;
        }

        const { price, priceUsd } = await this._getPrice(event, block);

        const tokenId = event.returnValues.tokenId;
        const entity = {
            provider_name: this.name,
            provider_contract: this.contract,
            protocol: this.protocol,
            nft_contract: this.contract,
            nft_id: tokenId,
            token: this.token,
            token_symbol: this.symbol.symbol,
            amount: 1,
            price,
            price_usd: priceUsd,
            seller: this.contract,
            buyer: buyer.toLowerCase(),
            sold_at: timestamp.format("YYYY-MM-DD HH:mm:ss"),
            block_number: event.blockNumber,
            transaction_hash: event.transactionHash,
        };
        await this.addToDatabase(entity);
    };

    addToDatabase = async entity => {
        return entity;
    };
}

module.exports = NFTKey;
