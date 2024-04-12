import axios from "axios";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

type Transaction = {
	from: string;
	to: string;
	value: string;
};

type BlockData = {
	result: {
		transactions: Transaction[];
	};
};

const API_KEY = process.env.API_KEY;

const getLatestBlockNumber = async () => {
	const response = await axios.get(
		`https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${API_KEY}`
	);
	return parseInt(response.data.result, 16);
};

const getTransactionsByBlockNumber = async (blockNumber: string) => {
	try {
		const response = await axios.get<BlockData>(
			`https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=${blockNumber}&boolean=true&apikey=${API_KEY}`
		);
		if (response.data.result.transactions != undefined)
			return response.data.result.transactions;
		else return [];
	} catch (error) {
		console.error(
			`Error fetching transactions for block ${blockNumber}`,
			error
		);
		return [];
	}
};

const getTransactionsDataAsync = async (
	startBlockNumber: number,
	blockCount: number
): Promise<Transaction[]> => {
	const transactionsData: Transaction[] = [];
	const promises = [];

	for (let i = 0; i < blockCount; i++) {
		const blockNumberHex = (startBlockNumber - i).toString(16);
		promises.push(
			getTransactionsByBlockNumber(blockNumberHex).catch((error) => {
				console.error(`Error get block info ${blockNumberHex}:`, error);
				return [];
			})
		);
	}

	const blocksData = await Promise.all(promises);
	transactionsData.push(...blocksData.flat());
	return transactionsData;
};

const calculateBalanceChanges = (transactions: Transaction[]) => {
	const addressBalancesDelta: { [address: string]: number } = {};
	let i = 0;
	for (const transaction of transactions) {
		i++;
		const fromAddress = transaction.from;
		const toAddress = transaction.to;
		const transactionValue = parseInt(transaction.value, 16);

		if (transactionValue) {
			addressBalancesDelta[fromAddress] =
				(addressBalancesDelta[fromAddress] || 0) - transactionValue;
			addressBalancesDelta[toAddress] =
				(addressBalancesDelta[toAddress] || 0) + transactionValue;
		}
	}
	return Object.entries(addressBalancesDelta)
		.map(([address, balanceChange]) => ({ address, balanceChange }))
		.sort((a, b) => Math.abs(b.balanceChange) - Math.abs(a.balanceChange));
};

const findAddressWithLargestBalanceChange = (
	balanceChanges: { address: string; balanceChange: number }[]
) => {
	return balanceChanges[0]
		? balanceChanges[0]
		: { address: null, balanceChange: 0 };
};

const app = express();
const port = 3000;

app.get("/api/balance-change", async (req: Request, res: Response) => {
	try {
		const blockNumber = parseInt(req.query.blockNumber as string);
		const latestBlock = await getLatestBlockNumber();
		if (isNaN(blockNumber) || blockNumber > latestBlock) {
			throw new Error("Invalid blockNumber query parameter");
		}

		const transactionsData = await getTransactionsDataAsync(blockNumber, 100);
		const balanceChanges = calculateBalanceChanges(transactionsData);
		const result = findAddressWithLargestBalanceChange(balanceChanges);

		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Failed to process request" });
	}
});

app.listen(port, () => {
	console.log(`API server listening on port ${port}`);
});
