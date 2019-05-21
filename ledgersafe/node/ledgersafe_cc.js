/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

// ====CHAINCODE EXECUTION SAMPLES (CLI) ==================

// ==== Invoke assets ====
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["initAsset","asset1","blue","35","tom"]}'
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["initAsset","asset2","red","50","tom"]}'
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["initAsset","asset3","blue","70","tom"]}'
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["transferAsset","asset2","jerry"]}'
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["transferAssetsBasedOnType","blue","jerry"]}'
// peer chaincode invoke -C myc1 -n assets -c '{"Args":["delete","asset1"]}'

// ==== Query assets ====
// peer chaincode query -C myc1 -n assets -c '{"Args":["readAsset","asset1"]}'
// peer chaincode query -C myc1 -n assets -c '{"Args":["getAssetsByRange","asset1","asset3"]}'
// peer chaincode query -C myc1 -n assets -c '{"Args":["getHistoryForAsset","asset1"]}'
// peer chaincode query -C myc1 -n assets -c '{"Args":["getAssetsByRangeWithPagination","asset1","asset3","3",""]}'

// Rich Query (Only supported if CouchDB is used as state database):
// peer chaincode query -C myc1 -n assets -c '{"Args":["queryAssetsByOwner","tom"]}'
// peer chaincode query -C myc1 -n assets -c '{"Args":["queryAssets","{\"selector\":{\"owner\":\"tom\"}}"]}'

// Rich Query with Pagination (Only supported if CouchDB is used as state database):
// peer chaincode query -C myc1 -n assets -c '{"Args":["queryAssetsWithPagination","{\"selector\":{\"owner\":\"tom\"}}","3",""]}'

'use strict';
const shim = require('fabric-shim');
const util = require('util');

let Chaincode = class {
  
  // ===============================================
  // Init -- Instantiate LedgerSafe Chaincode
  // ===============================================
  async Init(stub) {
    let ret = stub.getFunctionAndParameters();
    console.info(ret);
    console.info('=========== Instantiated LedgerSafe Chaincode ===========');
    return shim.success();
  }

  // ===============================================
  // Invoke -- Invokes a chaincode function
  // ===============================================
  async Invoke(stub) {
    console.info('Transaction ID: ' + stub.getTxID());
    console.info(util.format('Args: %j', stub.getArgs()));

    let ret = stub.getFunctionAndParameters();
    console.info(ret);

    let method = this[ret.fcn];
    if (!method) {
      console.log('no function of name:' + ret.fcn + ' found');
      throw new Error('Received unknown function ' + ret.fcn + ' invocation');
    }
    try {
      let payload = await method(stub, ret.params, this);
      return shim.success(payload);
    } catch (err) {
      console.log(err);
      return shim.error(err);
    }
  }

  // ===============================================
  // initAsset - create a new asset
  // ===============================================
  async initAsset(stub, args, thisClass) {
    if (args.length != 4) {
      throw new Error('Incorrect number of arguments. Expecting 4');
    }
    // ==== Input sanitation ====
    console.info('--- start init asset ---')
    if (args[0].lenth <= 0) {
      throw new Error('1st argument must be a non-empty string');
    }
    if (args[1].lenth <= 0) {
      throw new Error('2nd argument must be a non-empty string');
    }
    if (args[2].lenth <= 0) {
      throw new Error('3rd argument must be a non-empty string');
    }
    if (args[3].lenth <= 0) {
      throw new Error('4th argument must be a non-empty string');
    }
    let assetName = args[0];
    let assetType = args[1].toLowerCase();
    let owner = args[3].toLowerCase();
    let price = parseInt(args[2]);
    if (typeof price !== 'number') {
      throw new Error('3rd argument must be a numeric string');
    }

    // ==== Check if asset already exists ====
    let assetState = await stub.getState(assetName);
    if (assetState.toString()) {
      throw new Error('This asset already exists: ' + assetName);
    }

    // ==== Create asset object and marshal to JSON ====
    let asset = {};
    asset.docType = 'asset';
    asset.name = assetName;
    asset.assetType = assetType;
    asset.price = price;
    asset.owner = owner;

    // === Save asset to state ===
    await stub.putState(assetName, Buffer.from(JSON.stringify(asset)));
    let indexName = 'assetType~name'
    let assetNameIndexKey = await stub.createCompositeKey(indexName, [asset.assetType, asset.name]);
    console.info(assetNameIndexKey);
    //  Save index entry to state. Only the key name is needed, no need to store a duplicate copy of the asset.
    //  Note - passing a 'nil' value will effectively delete the key from state, therefore we pass null character as value
    await stub.putState(assetNameIndexKey, Buffer.from('\u0000'));
    // ==== asset saved and indexed. Return success ====
    console.info('- end init asset');
  }

  // ===============================================
  // readAsset - read a asset from chaincode state
  // ===============================================
  async readAsset(stub, args, thisClass) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting name of the asset to query');
    }

    let name = args[0];
    if (!name) {
      throw new Error(' asset name must not be empty');
    }
    let assetAsbytes = await stub.getState(name); //get the asset from chaincode state
    if (!assetAsbytes.toString()) {
      let jsonResp = {};
      jsonResp.Error = 'Asset does not exist: ' + name;
      throw new Error(JSON.stringify(jsonResp));
    }
    console.info('=======================================');
    console.log(assetAsbytes.toString());
    console.info('=======================================');
    return assetAsbytes;
  }

  // ==================================================
  // delete - remove a asset key/value pair from state
  // ==================================================
  async delete(stub, args, thisClass) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting name of the asset to delete');
    }
    let assetName = args[0];
    if (!assetName) {
      throw new Error('asset name must not be empty');
    }
    // to maintain the asset~name index, we need to read the asset first and get its asset
    let valAsbytes = await stub.getState(assetName); //get the asset from chaincode state
    let jsonResp = {};
    if (!valAsbytes) {
      jsonResp.error = 'asset does not exist: ' + name;
      throw new Error(jsonResp);
    }
    let assetJSON = {};
    try {
      assetJSON = JSON.parse(valAsbytes.toString());
    } catch (err) {
      jsonResp = {};
      jsonResp.error = 'Failed to decode JSON of: ' + assetName;
      throw new Error(jsonResp);
    }

    await stub.deleteState(assetName); //remove the asset from chaincode state

    // delete the index
    let indexName = 'asset~name';
    let assetNameIndexKey = stub.createCompositeKey(indexName, [assetJSON.assetType, assetJSON.name]);
    if (!assetNameIndexKey) {
      throw new Error(' Failed to create the createCompositeKey');
    }
    //  Delete index entry to state.
    await stub.deleteState(assetNameIndexKey);
  }

  // ===========================================================
  // transfer an asset by setting a new owner name on the asset
  // ===========================================================
  async transferAsset(stub, args, thisClass) {
    //   0       1
    // 'name', 'bob'
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting assetName and owner')
    }

    let assetName = args[0];
    let newOwner = args[1].toLowerCase();
    console.info('- start transferAsset ', assetName, newOwner);

    let assetAsBytes = await stub.getState(assetName);
    if (!assetAsBytes || !assetAsBytes.toString()) {
      throw new Error('asset does not exist');
    }
    let assetToTransfer = {};
    try {
      assetToTransfer = JSON.parse(assetAsBytes.toString()); //unmarshal
    } catch (err) {
      let jsonResp = {};
      jsonResp.error = 'Failed to decode JSON of: ' + assetName;
      throw new Error(jsonResp);
    }
    console.info(assetToTransfer);
    assetToTransfer.owner = newOwner; //change the owner

    let assetJSONasBytes = Buffer.from(JSON.stringify(assetToTransfer));
    await stub.putState(assetName, assetJSONasBytes); //rewrite the asset

    console.info('- end transferAsset (success)');
  }

  // ===========================================================================================
  // getAssetsByRange performs a range query based on the start and end keys provided.

  // Read-only function results are not typically submitted to ordering. If the read-only
  // results are submitted to ordering, or if the query is used in an update transaction
  // and submitted to ordering, then the committing peers will re-execute to guarantee that
  // result sets are stable between endorsement time and commit time. The transaction is
  // invalidated by the committing peers if the result set has changed between endorsement
  // time and commit time.
  // Therefore, range queries are a safe option for performing update transactions based on query results.
  // ===========================================================================================
  async getAssetsByRange(stub, args, thisClass) {

    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let startKey = args[0];
    let endKey = args[1];

    let resultsIterator = await stub.getStateByRange(startKey, endKey);
    let method = thisClass['getAllResults'];
    let results = await method(resultsIterator, false);

    return Buffer.from(JSON.stringify(results));
  }

  // ==== Example: GetStateByPartialCompositeKey/RangeQuery =========================================
  // transferAssetsBasedOnasset will transfer assets of a given assetType to a certain new owner.
  // Uses a GetStateByPartialCompositeKey (range query) against asset~name 'index'.
  // Committing peers will re-execute range queries to guarantee that result sets are stable
  // between endorsement time and commit time. The transaction is invalidated by the
  // committing peers if the result set has changed between endorsement time and commit time.
  // Therefore, range queries are a safe option for performing update transactions based on query results.
  // ===========================================================================================
  async transferAssetsBasedOnType(stub, args, thisClass) {

    //   0       1
    // 'color', 'bob'
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting assetType and owner');
    }

    let assetType = args[0];
    let newOwner = args[1].toLowerCase();
    console.info('- start transferAssetsBasedOnType ', assetType, newOwner);

    // Query the asset~name index by asset
    // This will execute a key range query on all keys starting with 'asset'
    let assetTypeedAssetResultsIterator = await stub.getStateByPartialCompositeKey('assetType~name', [assetType]);

    let method = thisClass['transferAsset'];
    // Iterate through result set and for each asset found, transfer to newOwner
    while (true) {
      let responseRange = await assetedAssetResultsIterator.next();
      if (!responseRange || !responseRange.value || !responseRange.value.key) {
        return;
      }
      console.log(responseRange.value.key);

      // let value = res.value.value.toString('utf8');
      let objectType;
      let attributes;
      ({
        objectType,
        attributes
      } = await stub.splitCompositeKey(responseRange.value.key));

      let returnedAsset = attributes[0];
      let returnedAssetName = attributes[1];
      console.info(util.format('- found a asset from index:%s assetType:%s name:%s\n', objectType, returnedAsset, returnedAssetName));

      // Now call the transfer function for the found asset.
      // Re-use the same function that is used to transfer individual assets
      let response = await method(stub, [returnedassetName, newOwner]);
    }

    let responsePayload = util.format('Transferred %s assets to %s', assetType, newOwner);
    console.info('- end transferAssetsBasedOnType: ' + responsePayload);
  }


  // ===== Example: Parameterized rich query =================================================
  // queryAssetsByOwner queries for assets based on a passed in owner.
  // This is an example of a parameterized query where the query logic is baked into the chaincode,
  // and accepting a single query parameter (owner).
  // Only available on state databases that support rich query (e.g. CouchDB)
  // =========================================================================================
  async queryAssetsByOwner(stub, args, thisClass) {
    //   0
    // 'bob'
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting owner name.')
    }

    let owner = args[0].toLowerCase();
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'asset';
    queryString.selector.owner = owner;
    let method = thisClass['getQueryResultForQueryString'];
    let queryResults = await method(stub, JSON.stringify(queryString), thisClass);
    return queryResults; //shim.success(queryResults);
  }

  // ===== Example: Ad hoc rich query ========================================================
  // queryAssets uses a query string to perform a query for assets.
  // Query string matching state database syntax is passed in and executed as is.
  // Supports ad hoc queries that can be defined at runtime by the client.
  // If this is not desired, follow the queryAssetsForOwner example for parameterized queries.
  // Only available on state databases that support rich query (e.g. CouchDB)
  // =========================================================================================
  async queryAssets(stub, args, thisClass) {
    //   0
    // 'queryString'
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting queryString');
    }
    let queryString = args[0];
    if (!queryString) {
      throw new Error('queryString must not be empty');
    }
    let method = thisClass['getQueryResultForQueryString'];
    let queryResults = await method(stub, queryString, thisClass);
    return queryResults;
  }

  async getAllResults(iterator, isHistory) {
    let allResults = [];
    while (true) {
      let res = await iterator.next();

      if (res.value && res.value.value.toString()) {
        let jsonRes = {};
        console.log(res.value.value.toString('utf8'));

        if (isHistory && isHistory === true) {
          jsonRes.TxId = res.value.tx_id;
          jsonRes.Timestamp = res.value.timestamp;
          jsonRes.IsDelete = res.value.is_delete.toString();
          try {
            jsonRes.Value = JSON.parse(res.value.value.toString('utf8'));
          } catch (err) {
            console.log(err);
            jsonRes.Value = res.value.value.toString('utf8');
          }
        } else {
          jsonRes.Key = res.value.key;
          try {
            jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
          } catch (err) {
            console.log(err);
            jsonRes.Record = res.value.value.toString('utf8');
          }
        }
        allResults.push(jsonRes);
      }
      if (res.done) {
        console.log('end of data');
        await iterator.close();
        console.info(allResults);
        return allResults;
      }
    }
  }

  // =========================================================================================
  // getQueryResultForQueryString executes the passed in query string.
  // Result set is built and returned as a byte array containing the JSON results.
  // =========================================================================================
  async getQueryResultForQueryString(stub, queryString, thisClass) {

    console.info('- getQueryResultForQueryString queryString:\n' + queryString)
    let resultsIterator = await stub.getQueryResult(queryString);
    let method = thisClass['getAllResults'];

    let results = await method(resultsIterator, false);

    return Buffer.from(JSON.stringify(results));
  }

  async getHistoryForAsset(stub, args, thisClass) {

    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting 1')
    }
    let assetName = args[0];
    console.info('- start getHistoryForAsset: %s\n', assetName);

    let resultsIterator = await stub.getHistoryForKey(assetName);
    let method = thisClass['getAllResults'];
    let results = await method(resultsIterator, true);

    return Buffer.from(JSON.stringify(results));
  }

  // ====== Pagination =========================================================================
  // Pagination provides a method to retrieve records with a defined pagesize and
  // start point (bookmark).  An empty string bookmark defines the first "page" of a query
  // result. Paginated queries return a bookmark that can be used in
  // the next query to retrieve the next page of results. Paginated queries extend
  // rich queries and range queries to include a pagesize and bookmark.
  //
  // Two examples are provided in this example. The first is getAssetsByRangeWithPagination
  // which executes a paginated range query.
  // The second example is a paginated query for rich ad-hoc queries.
  // =========================================================================================

  // ====== Example: Pagination with Range Query ===============================================
  // getAssetsByRangeWithPagination performs a range query based on the start & end key,
  // page size and a bookmark.
  //
  // The number of fetched records will be equal to or lesser than the page size.
  // Paginated range queries are only valid for read only transactions.
  // ===========================================================================================
  async getAssetsByRangeWithPagination(stub, args, thisClass) {
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }
    const startKey = args[0];
    const endKey = args[1];

    const pageSize = parseInt(args[2], 10);
    const bookmark = args[3];

    const { iterator, metadata } = await stub.getStateByRangeWithPagination(startKey, endKey, pageSize, bookmark);
    const getAllResults = thisClass['getAllResults'];
    const results = await getAllResults(iterator, false);
    // use RecordsCount and Bookmark to keep consistency with the go sample
    results.ResponseMetadata = {
      RecordsCount: metadata.fetched_records_count,
      Bookmark: metadata.bookmark,
    };
    return Buffer.from(JSON.stringify(results));
  }

  // =========================================================================================
  // getQueryResultForQueryStringWithPagination executes the passed in query string with
  // pagination info. Result set is built and returned as a byte array containing the JSON results.
  // =========================================================================================
  async queryAssetsWithPagination(stub, args, thisClass) {

    //   0
    // "queryString"
    if (args.length < 3) {
      return shim.Error("Incorrect number of arguments. Expecting 3")
    }

    const queryString = args[0];
    const pageSize = parseInt(args[2], 10);
    const bookmark = args[3];

    const { iterator, metadata } = await stub.GetQueryResultWithPagination(queryString, pageSize, bookmark);
    const getAllResults = thisClass['getAllResults'];
    const results = await getAllResults(iterator, false);
    // use RecordsCount and Bookmark to keep consistency with the go sample
    results.ResponseMetadata = {
      RecordsCount: metadata.fetched_records_count,
      Bookmark: metadata.bookmark,
    };

    return Buffer.from(JSON.stringify(results));
  }
};

shim.start(new Chaincode());
